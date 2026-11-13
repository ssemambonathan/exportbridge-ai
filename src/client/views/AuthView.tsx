import React, { useState } from 'react';
import { AuthSessionContext } from '../../shared/types.ts';
import { apiFetch } from '../lib/api.ts';
import { ErrorBanner, SuccessBanner } from '../components/UiPrimitives.tsx';
import { ArrowRight, ShieldCheck } from 'lucide-react';

export function AuthView({ onAuthenticated }: { onAuthenticated: (user: AuthSessionContext) => void }) {
  const [mode, setMode] = useState<'login' | 'register' | 'forgot'>('login');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Login state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  // Register state
  const [fullName, setFullName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [orgType, setOrgType] = useState<'supplier' | 'buyer'>('supplier');
  const [country, setCountry] = useState('Uganda');
  const [regNumber, setRegNumber] = useState('');

  // Password reset state
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ user: AuthSessionContext }>('/api/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });
      onAuthenticated(res.user);
    } catch (err: any) {
      setError(err.message || 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await apiFetch<{ user: AuthSessionContext }>('/api/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          fullName,
          email,
          password,
          organisationName: orgName,
          organisationType: orgType,
          country,
          registrationNumber: regNumber,
        }),
      });
      onAuthenticated(res.user);
    } catch (err: any) {
      setError(err.message || 'Registration failed.');
    } finally {
      setLoading(false);
    }
  }

  async function handleForgot(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setNotice(null);
    setLoading(true);
    try {
      const res = await apiFetch<any>('/api/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      if (res.devResetToken) {
        setResetToken(res.devResetToken);
        setNotice(`Reset token generated (local dev mode, SMTP not configured): ${res.devResetToken}`);
      } else {
        setNotice(res.message);
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleResetConfirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await apiFetch('/api/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token: resetToken, newPassword }),
      });
      setNotice('Password updated. You may now sign in with your new password.');
      setMode('login');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function fillDemoAccount(demoEmail: string) {
    setMode('login');
    setEmail(demoEmail);
    setPassword('ExportBridge2026!');
    setError(null);
  }

  return (
    <div className="min-h-screen bg-[#FAF8F3] grid grid-cols-1 lg:grid-cols-12 items-stretch">
      {/* Left Brand & Editorial Showcase */}
      <div className="lg:col-span-6 relative bg-[#11382A] text-[#FAF8F3] flex flex-col justify-between p-8 lg:p-12 overflow-hidden">
        <img
          src="/src/assets/images/export_port_logistics_1794565677671.jpg"
          alt="East African agricultural export terminal"
          referrerPolicy="no-referrer"
          className="absolute inset-0 w-full h-full object-cover opacity-30"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#0B261C] via-[#11382A]/75 to-[#0B261C]/85" />

        <div className="relative z-10">
          <div className="text-xl font-semibold tracking-tight">ExportBridge AI</div>
          <p className="mt-1 text-sm text-[#E4EDE9]/80">
            African Agricultural Export Operations Platform
          </p>
        </div>

        <div className="relative z-10 my-10 max-w-lg">
          <h1 className="text-3xl lg:text-4xl font-semibold leading-tight tracking-tight text-balance">
            Origin-to-port export execution governed by verified human authority.
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-[#E4EDE9]/90">
            Uniting cooperative inventory, grounded international buyer discovery, EUDR and phytosanitary readiness, Incoterm pricing, and ten specialized AI workers under strict human approval gates.
          </p>

          <div className="mt-8 grid grid-cols-3 gap-4 pt-6 border-t border-[#FAF8F3]/15">
            <div>
              <div className="text-xl font-semibold tabular-nums">17</div>
              <div className="text-xs text-[#E4EDE9]/75">Integrated Modules</div>
            </div>
            <div>
              <div className="text-xl font-semibold tabular-nums">10</div>
              <div className="text-xs text-[#E4EDE9]/75">Audited AI Agents</div>
            </div>
            <div>
              <div className="text-xl font-semibold tabular-nums">100%</div>
              <div className="text-xs text-[#E4EDE9]/75">Approval-Gated Trade</div>
            </div>
          </div>
        </div>

        <div className="relative z-10 flex items-center gap-2 text-xs text-[#E4EDE9]/80">
          <ShieldCheck className="w-4 h-4 text-[#D1A12B]" />
          <span>Organisation-isolated RBAC · Server-enforced compliance & financial sign-off</span>
        </div>
      </div>

      {/* Right Authentication Workspace */}
      <div className="lg:col-span-6 flex items-center justify-center p-6 sm:p-12">
        <div className="w-full max-w-md space-y-6">
          <div>
            <div className="flex items-center gap-1 p-1 bg-[#F3EFE4] rounded-lg border border-[#E5DEC9]">
              <button
                type="button"
                onClick={() => { setMode('login'); setError(null); }}
                className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'login' ? 'bg-white text-[#1C1F1E] shadow-xs' : 'text-[#666D6A] hover:text-[#1C1F1E]'
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => { setMode('register'); setError(null); }}
                className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'register' ? 'bg-white text-[#1C1F1E] shadow-xs' : 'text-[#666D6A] hover:text-[#1C1F1E]'
                }`}
              >
                Register Organisation
              </button>
              <button
                type="button"
                onClick={() => { setMode('forgot'); setError(null); }}
                className={`flex-1 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap ${
                  mode === 'forgot' ? 'bg-white text-[#1C1F1E] shadow-xs' : 'text-[#666D6A] hover:text-[#1C1F1E]'
                }`}
              >
                Recover Access
              </button>
            </div>
          </div>

          <ErrorBanner message={error} onDismiss={() => setError(null)} />
          <SuccessBanner message={notice} onDismiss={() => setNotice(null)} />

          {mode === 'login' ? (
            <form onSubmit={handleLogin} className="bg-white border border-[#E5DEC9] rounded-lg p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[#1C1F1E]">Sign in to ExportBridge AI</h2>
                <p className="text-xs text-[#666D6A] mt-0.5">Access your organisation workspace and operations queue.</p>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1F1E] mb-1">Work Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@company.com"
                  className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md focus:outline-none focus:border-[#11382A]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1F1E] mb-1">Password</label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter password"
                  className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md focus:outline-none focus:border-[#11382A]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 bg-[#11382A] text-[#FAF8F3] text-sm font-medium rounded-md hover:bg-[#174937] disabled:opacity-50 transition-colors"
              >
                <span>{loading ? 'Authenticating...' : 'Sign In'}</span>
                <ArrowRight className="w-4 h-4" />
              </button>

              {/* Explicitly labelled Demonstration Accounts */}
              <div className="pt-4 border-t border-[#E5DEC9]">
                <div className="text-xs font-medium text-[#666D6A] mb-2">
                  Demonstration Accounts (Explicitly Labelled Sample Data)
                </div>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('founder@exportbridge.ai')}
                    className="text-left px-3 py-2 border border-[#E5DEC9] rounded-md hover:bg-[#FAF8F3] text-xs transition-colors"
                  >
                    <span className="font-medium text-[#1C1F1E]">Founder Admin</span>
                    <span className="text-[#666D6A]"> · founder@exportbridge.ai</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('compliance@exportbridge.ai')}
                    className="text-left px-3 py-2 border border-[#E5DEC9] rounded-md hover:bg-[#FAF8F3] text-xs transition-colors"
                  >
                    <span className="font-medium text-[#1C1F1E]">Compliance Officer</span>
                    <span className="text-[#666D6A]"> · compliance@exportbridge.ai</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fillDemoAccount('coop@rwenzori-demo.ug')}
                    className="text-left px-3 py-2 border border-[#E5DEC9] rounded-md hover:bg-[#FAF8F3] text-xs transition-colors"
                  >
                    <span className="font-medium text-[#1C1F1E]">Supplier Cooperative (Demo)</span>
                    <span className="text-[#666D6A]"> · coop@rwenzori-demo.ug</span>
                  </button>
                </div>
              </div>
            </form>
          ) : null}

          {mode === 'register' ? (
            <form onSubmit={handleRegister} className="bg-white border border-[#E5DEC9] rounded-lg p-6 space-y-4">
              <div>
                <h2 className="text-lg font-semibold text-[#1C1F1E]">Register Exporter or Buyer Organisation</h2>
                <p className="text-xs text-[#666D6A] mt-0.5">Creates an isolated organisation tenant and administrator account.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1F1E] mb-1">Full Name</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Samuel Mugisha"
                    className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md focus:outline-none focus:border-[#11382A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1C1F1E] mb-1">Account Type</label>
                  <select
                    value={orgType}
                    onChange={(e) => setOrgType(e.target.value as 'supplier' | 'buyer')}
                    className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md bg-white focus:outline-none focus:border-[#11382A]"
                  >
                    <option value="supplier">Supplier / Cooperative</option>
                    <option value="buyer">International Buyer</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1F1E] mb-1">Organisation Legal Name</label>
                <input
                  type="text"
                  required
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="Mt. Elgon Arabica Growers Cooperative"
                  className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md focus:outline-none focus:border-[#11382A]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#1C1F1E] mb-1">Country</label>
                  <input
                    type="text"
                    required
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                    className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md focus:outline-none focus:border-[#11382A]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#1C1F1E] mb-1">Registration No.</label>
                  <input
                    type="text"
                    value={regNumber}
                    onChange={(e) => setRegNumber(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md focus:outline-none focus:border-[#11382A]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1F1E] mb-1">Work Email</label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md focus:outline-none focus:border-[#11382A]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#1C1F1E] mb-1">Password (min 8 chars)</label>
                <input
                  type="password"
                  required
                  minLength={8}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md focus:outline-none focus:border-[#11382A]"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-[#11382A] text-[#FAF8F3] text-sm font-medium rounded-md hover:bg-[#174937] disabled:opacity-50 transition-colors"
              >
                {loading ? 'Creating Organisation...' : 'Create Account & Workspace'}
              </button>
            </form>
          ) : null}

          {mode === 'forgot' ? (
            <div className="bg-white border border-[#E5DEC9] rounded-lg p-6 space-y-5">
              <form onSubmit={handleForgot} className="space-y-3">
                <h2 className="text-lg font-semibold text-[#1C1F1E]">Password Recovery</h2>
                <p className="text-xs text-[#666D6A]">Request a single-use recovery token to reset your account password.</p>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Registered account email"
                  className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md focus:outline-none focus:border-[#11382A]"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 px-4 bg-[#1C1F1E] text-white text-sm font-medium rounded-md hover:bg-[#3A3F3D]"
                >
                  Request Reset Token
                </button>
              </form>

              <form onSubmit={handleResetConfirm} className="pt-4 border-t border-[#E5DEC9] space-y-3">
                <div className="text-xs font-medium text-[#1C1F1E]">Confirm Reset Token</div>
                <input
                  type="text"
                  required
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Paste reset token"
                  className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md font-mono"
                />
                <input
                  type="password"
                  required
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="New password (min 8 chars)"
                  className="w-full px-3 py-2 text-sm border border-[#D9D3C4] rounded-md"
                />
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2 px-4 bg-[#11382A] text-white text-sm font-medium rounded-md hover:bg-[#174937]"
                >
                  Update Password
                </button>
              </form>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
