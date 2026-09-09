import React, { useState, useEffect } from 'react';
import {
  X,
  Lock,
  Mail,
  User,
  Shield,
  AlertCircle,
  Loader2,
  CheckCircle2,
  ArrowLeft,
  Smartphone,
  RefreshCw,
  KeyRound,
} from 'lucide-react';
import {
  loginUser,
  registerUser,
  setAuthToken,
  requestPasswordReset,
  verifyResetOtp,
  resetPassword,
} from '../api';
import { User as UserType } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: UserType) => void;
}

type ModalView =
  | 'login'
  | 'register'
  | 'forgot-identifier'
  | 'forgot-otp'
  | 'forgot-reset';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
}) => {
  const [view, setView] = useState<ModalView>('login');

  // Sign In / Sign Up states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'CITIZEN' | 'AUTHORITY'>('CITIZEN');

  // Forgot Password flow states
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [maskedDestination, setMaskedDestination] = useState('');
  const [destinationType, setDestinationType] = useState<'email' | 'phone'>('email');
  const [devOtpHint, setDevOtpHint] = useState<string | undefined>();
  const [resendCooldown, setResendCooldown] = useState(0);

  // Common UI states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Resend OTP countdown ticker
  useEffect(() => {
    if (resendCooldown <= 0) return;
    const interval = setInterval(() => {
      setResendCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [resendCooldown]);

  if (!isOpen) return null;

  const handleClose = () => {
    setError(null);
    setSuccessMsg(null);
    setView('login');
    onClose();
  };

  // Sign In & Sign Up submit handler
  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      if (view === 'login') {
        const res = await loginUser({ email, password });
        setAuthToken(res.data.token);
        onAuthSuccess(res.data.user);
        handleClose();
      } else {
        const res = await registerUser({ name, email, password, role });
        setAuthToken(res.data.token);
        onAuthSuccess(res.data.user);
        handleClose();
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Request 6-digit OTP
  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!identifier.trim()) {
      setError('Please enter your registered email or mobile number.');
      return;
    }

    setLoading(true);
    try {
      const res = await requestPasswordReset(identifier.trim());
      setMaskedDestination(res.data.maskedDestination);
      setDestinationType(res.data.destinationType);
      setDevOtpHint(res.data.devOtpHint);
      setResendCooldown(30); // 30-second cooldown
      setView('forgot-otp');
    } catch (err: any) {
      // Clear account not found or rate-limit message
      setError(err.message || 'Unable to process password reset request.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2: Verify 6-digit OTP
  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanOtp = otp.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      setError('Please enter a valid 6-digit numeric OTP.');
      return;
    }

    setLoading(true);
    try {
      const res = await verifyResetOtp(identifier.trim(), cleanOtp);
      setResetToken(res.data.resetToken);
      setView('forgot-reset');
    } catch (err: any) {
      setError(err.message || 'Invalid or expired OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Step 3: Set New Password
  const handleSetNewPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (newPassword.length < 6) {
      setError('New password must be at least 6 characters long.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match. Please verify.');
      return;
    }

    setLoading(true);
    try {
      const res = await resetPassword(resetToken, newPassword, confirmPassword);
      // Requirement 7: Redirect to sign-in screen with success banner
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setOtp('');
      setResetToken('');
      setDevOtpHint(undefined);
      setView('login');
      setSuccessMsg(res.message || 'Password reset successfully. Please sign in.');
    } catch (err: any) {
      setError(err.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (type: 'citizen' | 'authority') => {
    if (type === 'citizen') {
      setEmail('aarav@citizen.in');
      setPassword('password123');
      setIdentifier('aarav@citizen.in');
      setView('login');
    } else {
      setEmail('authority@bbmp.gov.in');
      setPassword('password123');
      setIdentifier('+91 8022221111');
      setView('login');
    }
  };

  const isIdentifierEmail = identifier.includes('@');

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2">
            {view.startsWith('forgot-') && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  if (view === 'forgot-otp') setView('forgot-identifier');
                  else if (view === 'forgot-reset') setView('forgot-otp');
                  else setView('login');
                }}
                className="p-1 -ml-1 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition"
                title="Go back"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-sm font-bold text-slate-900">
              {view === 'login' && 'Sign In to Nivara'}
              {view === 'register' && 'Create Civic Account'}
              {view === 'forgot-identifier' && 'Reset Password'}
              {view === 'forgot-otp' && 'Verify 6-Digit OTP'}
              {view === 'forgot-reset' && 'Set New Password'}
            </h2>
          </div>
          <button
            onClick={handleClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-full hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Success Banner (Requirement 7) */}
          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-start space-x-2.5 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span className="leading-snug">{successMsg}</span>
            </div>
          )}

          {/* Error Banner */}
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-start space-x-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span className="leading-snug">{error}</span>
            </div>
          )}

          {/* VIEW: LOGIN & REGISTER */}
          {(view === 'login' || view === 'register') && (
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {/* Quick Demo Switchers */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 tracking-wider">
                  Quick Demo Accounts
                </span>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => handleQuickFill('citizen')}
                    className="flex-1 py-1.5 px-2 bg-white border border-slate-200 hover:border-sky-500 hover:bg-sky-50/50 rounded-lg text-[11px] font-semibold text-slate-700 transition"
                  >
                    Citizen Demo
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickFill('authority')}
                    className="flex-1 py-1.5 px-2 bg-white border border-slate-200 hover:border-amber-500 hover:bg-amber-50/50 rounded-lg text-[11px] font-semibold text-slate-700 transition"
                  >
                    Authority Demo
                  </button>
                </div>
              </div>

              {view === 'register' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Full Name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g. Aarav Sharma"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      setIdentifier(e.target.value);
                    }}
                    required
                    placeholder="yourname@domain.com"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Password
                  </label>
                  {/* Requirement 1: Entry Point for Citizen & Authority */}
                  {view === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setError(null);
                        setSuccessMsg(null);
                        setIdentifier(email);
                        setView('forgot-identifier');
                      }}
                      className="text-[11px] font-semibold text-sky-600 hover:text-sky-700 hover:underline transition"
                    >
                      Forgot Password?
                    </button>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              {view === 'register' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                    Account Type
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setRole('CITIZEN')}
                      className={`py-1.5 rounded-xl text-xs font-bold border transition ${
                        role === 'CITIZEN'
                          ? 'bg-sky-50 border-sky-500 text-sky-900 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      Citizen
                    </button>
                    <button
                      type="button"
                      onClick={() => setRole('AUTHORITY')}
                      className={`py-1.5 rounded-xl text-xs font-bold border transition ${
                        role === 'AUTHORITY'
                          ? 'bg-amber-50 border-amber-500 text-amber-900 shadow-sm'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      Authority
                    </button>
                  </div>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-md shadow-sky-600/20 transition active:scale-95 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : view === 'login' ? (
                  'Sign In'
                ) : (
                  'Create Account'
                )}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMsg(null);
                    setView(view === 'login' ? 'register' : 'login');
                  }}
                  className="text-xs text-slate-500 hover:text-sky-600 transition font-medium"
                >
                  {view === 'login'
                    ? "Don't have an account? Sign up"
                    : 'Already have an account? Sign in'}
                </button>
              </div>
            </form>
          )}

          {/* VIEW: FORGOT PASSWORD - STEP 1 (IDENTIFIER INPUT) */}
          {view === 'forgot-identifier' && (
            <form onSubmit={handleRequestOtp} className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Enter your registered <strong>email address</strong> or{' '}
                <strong>mobile number</strong>. We will send a secure 6-digit OTP
                to reset your password.
              </p>

              {/* Quick Demo Pre-fills for Testing */}
              <div className="bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5 tracking-wider text-center">
                  Quick Test Accounts
                </span>
                <div className="flex space-x-2">
                  <button
                    type="button"
                    onClick={() => setIdentifier('aarav@citizen.in')}
                    className="flex-1 py-1 px-2 bg-white border border-slate-200 hover:border-sky-500 rounded-lg text-[10px] font-semibold text-slate-700 transition"
                  >
                    Citizen (Email)
                  </button>
                  <button
                    type="button"
                    onClick={() => setIdentifier('+91 8022221111')}
                    className="flex-1 py-1 px-2 bg-white border border-slate-200 hover:border-amber-500 rounded-lg text-[10px] font-semibold text-slate-700 transition"
                  >
                    Authority (SMS)
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Email or Mobile
                  </label>
                  {identifier.trim() && (
                    <span
                      className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md flex items-center space-x-1 ${
                        isIdentifierEmail
                          ? 'bg-sky-50 text-sky-700 border border-sky-200'
                          : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      }`}
                    >
                      {isIdentifierEmail ? (
                        <>
                          <Mail className="w-2.5 h-2.5" />
                          <span>Email detected</span>
                        </>
                      ) : (
                        <>
                          <Smartphone className="w-2.5 h-2.5" />
                          <span>SMS / Mobile detected</span>
                        </>
                      )}
                    </span>
                  )}
                </div>
                <div className="relative">
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    required
                    placeholder="e.g. aarav@citizen.in or +91 8022221111"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  {isIdentifierEmail ? (
                    <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  ) : (
                    <Smartphone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  )}
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !identifier.trim()}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-md shadow-sky-600/20 transition active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Send 6-Digit OTP</span>
                )}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setView('login');
                  }}
                  className="text-xs text-slate-500 hover:text-sky-600 transition font-medium"
                >
                  Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* VIEW: FORGOT PASSWORD - STEP 2 (OTP VERIFICATION) */}
          {view === 'forgot-otp' && (
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs text-slate-700 space-y-1">
                <div className="flex items-center space-x-1.5 font-bold text-slate-800">
                  {destinationType === 'email' ? (
                    <Mail className="w-3.5 h-3.5 text-sky-600" />
                  ) : (
                    <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                  )}
                  <span>Code sent to {maskedDestination}</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Enter the 6-digit verification code. It expires in 10 minutes.
                </p>
              </div>

              {/* Dev/Viva helper banner for quick testing without live SMS provider */}
              {devOtpHint && (
                <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-center justify-between">
                  <div className="flex items-center space-x-1.5">
                    <Shield className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>
                      Demo OTP:{' '}
                      <strong className="tracking-widest font-mono font-bold text-amber-950">
                        {devOtpHint}
                      </strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOtp(devOtpHint)}
                    className="text-[10px] font-bold text-amber-800 underline hover:text-amber-950 px-1.5 py-0.5 rounded hover:bg-amber-100"
                  >
                    Auto-Fill
                  </button>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  6-Digit OTP Code
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    placeholder="••••••"
                    className="w-full text-center tracking-[0.6em] font-mono text-base font-bold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
                </div>
              </div>

              {/* Requirement 5: Resend OTP link with 30-second countdown */}
              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500">Didn't receive code?</span>
                {resendCooldown > 0 ? (
                  <span className="text-slate-400 font-medium">
                    Resend OTP in <strong className="text-slate-600">{resendCooldown}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleRequestOtp()}
                    disabled={loading}
                    className="font-bold text-sky-600 hover:text-sky-700 hover:underline transition flex items-center space-x-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    <span>Resend OTP</span>
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={loading || otp.length !== 6}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-md shadow-sky-600/20 transition active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Verify OTP</span>
                )}
              </button>
            </form>
          )}

          {/* VIEW: FORGOT PASSWORD - STEP 3 (SET NEW PASSWORD) */}
          {view === 'forgot-reset' && (
            <form onSubmit={handleSetNewPassword} className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Choose a strong new password for your account (minimum 6 characters).
              </p>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  New Password
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    placeholder="At least 6 characters"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Confirm Password
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    placeholder="Repeat new password"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading || !newPassword || !confirmPassword}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-md shadow-sky-600/20 transition active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Reset & Save Password</span>
                )}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
