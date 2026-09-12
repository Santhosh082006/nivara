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
  Check,
  Clock,
} from 'lucide-react';
import {
  loginUser,
  verifyLoginOtp,
  resendLoginOtp,
  setAuthToken,
  requestPasswordReset,
  verifyResetOtp,
  resetPassword,
  startSignup,
  verifySignupOtp,
  resendSignupOtp,
  completeSignup,
} from '../api';
import { User as UserType } from '../types';
import { PasswordInput } from './PasswordInput';
import { PasswordChecklist, isPasswordValid } from './PasswordChecklist';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: UserType) => void;
}

type ModalView =
  | 'login'
  | 'login-otp'
  | 'register'
  | 'signup-verify'
  | 'forgot-identifier'
  | 'forgot-otp'
  | 'forgot-reset';

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
}) => {
  const [view, setView] = useState<ModalView>('login');

  // Sign In / Sign Up form states
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [signupConfirmPassword, setSignupConfirmPassword] = useState('');
  const [role, setRole] = useState<'CITIZEN' | 'AUTHORITY'>('CITIZEN');

  // Login OTP Challenge states
  const [loginChallengeToken, setLoginChallengeToken] = useState('');
  const [loginMaskedDestination, setLoginMaskedDestination] = useState('');
  const [loginChannel, setLoginChannel] = useState<'email' | 'phone'>('email');
  const [loginOtp, setLoginOtp] = useState('');
  const [loginResendCooldown, setLoginResendCooldown] = useState(0);

  // Dual OTP Signup verification states
  const [signupSessionId, setSignupSessionId] = useState('');
  const [signupMaskedEmail, setSignupMaskedEmail] = useState('');
  const [signupMaskedPhone, setSignupMaskedPhone] = useState('');
  const [signupEmailOtp, setSignupEmailOtp] = useState('');
  const [signupPhoneOtp, setSignupPhoneOtp] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isPhoneVerified, setIsPhoneVerified] = useState(false);
  const [emailVerifyLoading, setEmailVerifyLoading] = useState(false);
  const [phoneVerifyLoading, setPhoneVerifyLoading] = useState(false);
  const [emailResendCooldown, setEmailResendCooldown] = useState(0);
  const [phoneResendCooldown, setPhoneResendCooldown] = useState(0);

  // Forgot Password flow states
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [maskedDestination, setMaskedDestination] = useState('');
  const [destinationType, setDestinationType] = useState<'email' | 'phone'>('email');
  const [forgotResendCooldown, setForgotResendCooldown] = useState(0);

  // Common UI states
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Ticker for Login OTP cooldown
  useEffect(() => {
    if (loginResendCooldown <= 0) return;
    const interval = setInterval(() => {
      setLoginResendCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [loginResendCooldown]);

  // Ticker for Forgot Password OTP cooldown
  useEffect(() => {
    if (forgotResendCooldown <= 0) return;
    const interval = setInterval(() => {
      setForgotResendCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [forgotResendCooldown]);

  // Ticker for Signup Email OTP cooldown
  useEffect(() => {
    if (emailResendCooldown <= 0) return;
    const interval = setInterval(() => {
      setEmailResendCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [emailResendCooldown]);

  // Ticker for Signup Mobile OTP cooldown
  useEffect(() => {
    if (phoneResendCooldown <= 0) return;
    const interval = setInterval(() => {
      setPhoneResendCooldown((prev) => (prev > 1 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(interval);
  }, [phoneResendCooldown]);

  if (!isOpen) return null;

  const handleClose = () => {
    setError(null);
    setSuccessMsg(null);
    setView('login');
    setLoginOtp('');
    setLoginChallengeToken('');
    onClose();
  };

  // Sign In Step 1: Submit credentials & receive login challenge
  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setLoading(true);

    try {
      const res = await loginUser({ email: email.trim(), password });
      if (res.data && res.data.loginChallengeToken) {
        setLoginChallengeToken(res.data.loginChallengeToken);
        setLoginMaskedDestination(res.data.maskedDestination);
        setLoginChannel(res.data.channel || 'email');
        setLoginOtp('');
        setLoginResendCooldown(30);
        setView('login-otp');
        setSuccessMsg(`Verification code sent to your registered ${res.data.channel === 'phone' ? 'mobile number' : 'email'}.`);
      } else {
        throw new Error('Verification required.');
      }
    } catch (err: any) {
      setError(err.message || 'Invalid email or password.');
    } finally {
      setLoading(false);
    }
  };

  // Sign In Step 2: Verify 6-digit Login OTP
  const handleVerifyLoginOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    const cleanOtp = loginOtp.trim();
    if (!/^\d{6}$/.test(cleanOtp)) {
      setError('Please enter a valid 6-digit numeric OTP.');
      return;
    }

    setLoading(true);
    try {
      const res = await verifyLoginOtp({
        loginChallengeToken,
        otp: cleanOtp,
      });
      setAuthToken(res.data.token);
      onAuthSuccess(res.data.user);
      handleClose();
    } catch (err: any) {
      setError(err.message || 'Failed to verify sign-in OTP.');
    } finally {
      setLoading(false);
    }
  };

  // Resend Login OTP
  const handleResendLoginOtp = async () => {
    if (loginResendCooldown > 0) return;
    setError(null);
    setSuccessMsg(null);
    setLoading(true);
    try {
      const res = await resendLoginOtp({ loginChallengeToken });
      setLoginResendCooldown(30);
      setSuccessMsg(res.message || 'A new verification code has been sent.');
    } catch (err: any) {
      setError(err.message || 'Could not resend login OTP.');
    } finally {
      setLoading(false);
    }
  };

  // Step 1: Start Dual OTP Signup
  const handleStartSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!name.trim()) {
      setError('Please enter your full name.');
      return;
    }

    if (!email.trim() || !email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }

    const cleanDigits = phone.replace(/\D/g, '');
    if (cleanDigits.length < 10) {
      setError('Please enter a valid 10-digit mobile number.');
      return;
    }

    if (!isPasswordValid(password, signupConfirmPassword)) {
      setError('Password must meet all complexity requirements and confirm password must match.');
      return;
    }

    setLoading(true);
    try {
      const res = await startSignup({
        name: name.trim(),
        email: email.trim(),
        phone: phone.trim(),
        password,
        confirmPassword: signupConfirmPassword,
        role,
      });

      setSignupSessionId(res.data.sessionId);
      setSignupMaskedEmail(res.data.maskedEmail);
      setSignupMaskedPhone(res.data.maskedPhone);
      setIsEmailVerified(false);
      setIsPhoneVerified(false);
      setSignupEmailOtp('');
      setSignupPhoneOtp('');
      setEmailResendCooldown(30);
      setPhoneResendCooldown(30);
      setView('signup-verify');
    } catch (err: any) {
      setError(err.message || 'Unable to initiate verification.');
    } finally {
      setLoading(false);
    }
  };

  // Step 2a: Verify Email OTP during Signup
  const handleVerifySignupEmail = async () => {
    setError(null);
    if (!/^\d{6}$/.test(signupEmailOtp.trim())) {
      setError('Please enter a valid 6-digit email verification code.');
      return;
    }

    setEmailVerifyLoading(true);
    try {
      const res = await verifySignupOtp({
        sessionId: signupSessionId,
        type: 'email',
        otp: signupEmailOtp.trim(),
      });
      setIsEmailVerified(res.data.isEmailVerified);
    } catch (err: any) {
      setError(err.message || 'Failed to verify email OTP.');
    } finally {
      setEmailVerifyLoading(false);
    }
  };

  // Step 2b: Verify Mobile OTP during Signup
  const handleVerifySignupPhone = async () => {
    setError(null);
    if (!/^\d{6}$/.test(signupPhoneOtp.trim())) {
      setError('Please enter a valid 6-digit mobile verification code.');
      return;
    }

    setPhoneVerifyLoading(true);
    try {
      const res = await verifySignupOtp({
        sessionId: signupSessionId,
        type: 'phone',
        otp: signupPhoneOtp.trim(),
      });
      setIsPhoneVerified(res.data.isPhoneVerified);
    } catch (err: any) {
      setError(err.message || 'Failed to verify mobile OTP.');
    } finally {
      setPhoneVerifyLoading(false);
    }
  };

  // Resend Email OTP during Signup
  const handleResendSignupEmail = async () => {
    setError(null);
    try {
      await resendSignupOtp({
        sessionId: signupSessionId,
        type: 'email',
      });
      setEmailResendCooldown(30);
    } catch (err: any) {
      setError(err.message || 'Could not resend email OTP.');
    }
  };

  // Resend Mobile OTP during Signup
  const handleResendSignupPhone = async () => {
    setError(null);
    try {
      await resendSignupOtp({
        sessionId: signupSessionId,
        type: 'phone',
      });
      setPhoneResendCooldown(30);
    } catch (err: any) {
      setError(err.message || 'Could not resend mobile OTP.');
    }
  };

  // Step 3: Complete Account Creation
  const handleCompleteSignup = async () => {
    setError(null);
    setLoading(true);

    try {
      const res = await completeSignup({
        sessionId: signupSessionId,
        name: name.trim(),
        password,
        confirmPassword: signupConfirmPassword,
        role,
      });

      // Clear form states
      setName('');
      setPassword('');
      setSignupConfirmPassword('');
      setPhone('');
      setEmail('');
      setSignupSessionId('');
      setSignupEmailOtp('');
      setSignupPhoneOtp('');
      setIsEmailVerified(false);
      setIsPhoneVerified(false);

      // Redirect to sign in with success message (Requirement 6)
      setView('login');
      setSuccessMsg(res.message || 'Account created successfully. Please sign in.');
    } catch (err: any) {
      setError(err.message || 'Failed to create account.');
    } finally {
      setLoading(false);
    }
  };

  // Forgot Password: Request OTP
  const handleForgotRequestOtp = async (e?: React.FormEvent) => {
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
      setMaskedDestination(res.data?.maskedDestination || identifier.trim());
      setDestinationType(res.data?.destinationType || (identifier.includes('@') ? 'email' : 'phone'));
      setForgotResendCooldown(30);
      setView('forgot-otp');
    } catch (err: any) {
      setError(err.message || 'Unable to process password reset request.');
    } finally {
      setLoading(false);
    }
  };

  // Forgot Password: Verify OTP
  const handleForgotVerifyOtp = async (e: React.FormEvent) => {
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
      setResetToken(res.data.resetToken || res.data.passwordResetToken || '');
      setView('forgot-reset');
    } catch (err: any) {
      setError(err.message || 'Invalid or expired OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Forgot Password: Set New Password
  const handleForgotResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!isPasswordValid(newPassword, confirmPassword)) {
      setError('Password must meet all complexity requirements and confirm password must match.');
      return;
    }

    setLoading(true);
    try {
      const res = await resetPassword(resetToken, newPassword, confirmPassword);
      setPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setOtp('');
      setResetToken('');
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
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <div className="flex items-center space-x-2">
            {(view.startsWith('forgot-') || view === 'signup-verify' || view === 'login-otp') && (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  if (view === 'login-otp') setView('login');
                  else if (view === 'signup-verify') setView('register');
                  else if (view === 'forgot-otp') setView('forgot-identifier');
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
              {view === 'login-otp' && 'Verify Sign-In OTP'}
              {view === 'register' && 'Create Civic Account'}
              {view === 'signup-verify' && 'Dual OTP Verification'}
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
          {/* Success Banner */}
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

          {/* VIEW: LOGIN */}
          {view === 'login' && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="yourname@domain.com"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="login-password" className="block text-xs font-bold uppercase tracking-wider text-slate-500">
                    Password
                  </label>
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
                </div>
                <PasswordInput
                  id="login-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  placeholder="••••••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-md shadow-sky-600/20 transition active:scale-95 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  'Sign In'
                )}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMsg(null);
                    setView('register');
                  }}
                  className="text-xs text-slate-500 hover:text-sky-600 transition font-medium"
                >
                  Don't have an account? Sign up
                </button>
              </div>
            </form>
          )}

          {/* VIEW: LOGIN OTP (STEP 2 OF SIGN IN) */}
          {view === 'login-otp' && (
            <form onSubmit={handleVerifyLoginOtp} className="space-y-4">
              <div className="p-3.5 bg-slate-50 rounded-2xl border border-slate-200/80 text-xs text-slate-700 space-y-1.5">
                <div className="flex items-center space-x-2 font-bold text-slate-800">
                  {loginChannel === 'phone' ? (
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Mail className="w-4 h-4 text-sky-600" />
                  )}
                  <span>Code sent to {loginMaskedDestination}</span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Enter the real-time 6-digit verification code sent to your registered {loginChannel === 'phone' ? 'mobile number' : 'email'}. Code expires in 10 minutes.
                </p>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  6-Digit Verification Code
                </label>
                <div className="relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={6}
                    value={loginOtp}
                    onChange={(e) => setLoginOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    required
                    autoFocus
                    placeholder="••••••"
                    className="w-full text-center tracking-[0.6em] font-mono text-base font-bold px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-3.5 pointer-events-none" />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500">Didn't receive code?</span>
                {loginResendCooldown > 0 ? (
                  <span className="text-slate-400 font-medium">
                    Resend OTP in <strong className="text-slate-600">{loginResendCooldown}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={handleResendLoginOtp}
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
                disabled={loading || loginOtp.length !== 6}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 text-white text-xs font-bold rounded-xl shadow-md shadow-sky-600/20 transition active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Verify & Sign In</span>
                )}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMsg(null);
                    setView('login');
                  }}
                  className="text-xs text-slate-500 hover:text-sky-600 transition font-medium"
                >
                  Back to sign in
                </button>
              </div>
            </form>
          )}

          {/* VIEW: SIGNUP DETAILS (STEP 1) */}
          {view === 'register' && (
            <form onSubmit={handleStartSignup} className="space-y-3.5">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Full Name <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    placeholder="e.g. Aarav Sharma"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <User className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Email Address <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="yourname@domain.com"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <Mail className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
              </div>

              {/* Requirement 1: Mobile Number Field */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                  Mobile Number <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                    placeholder="+91 98450 12345"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <Smartphone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                </div>
                <p className="text-[10px] text-slate-400 mt-1">
                  Both Email and Mobile will be verified via real-time 6-digit OTPs.
                </p>
              </div>

              <PasswordInput
                id="signup-password"
                label="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="At least 12 characters"
              />

              <PasswordInput
                id="signup-confirm-password"
                label="Confirm Password"
                value={signupConfirmPassword}
                onChange={(e) => setSignupConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Repeat password"
              />

              <PasswordChecklist
                password={password}
                confirmPassword={signupConfirmPassword}
              />

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

              <button
                type="submit"
                disabled={loading || !isPasswordValid(password, signupConfirmPassword)}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-xl shadow-md shadow-sky-600/20 transition active:scale-95 flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <span>Continue to Verification</span>
                )}
              </button>

              <div className="text-center pt-1">
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setSuccessMsg(null);
                    setView('login');
                  }}
                  className="text-xs text-slate-500 hover:text-sky-600 transition font-medium"
                >
                  Already have an account? Sign in
                </button>
              </div>
            </form>
          )}

          {/* VIEW: DUAL OTP VERIFICATION (STEP 2) */}
          {view === 'signup-verify' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-600 leading-relaxed">
                Before your account is created, verify <strong>both</strong> your
                email and mobile number with the 6-digit codes sent.
              </div>

              {/* CARD 1: EMAIL OTP */}
              <div
                className={`p-3 rounded-2xl border transition ${
                  isEmailVerified
                    ? 'bg-emerald-50/60 border-emerald-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-xs font-bold text-slate-800">
                      Email: {signupMaskedEmail}
                    </span>
                  </div>
                  {isEmailVerified ? (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center space-x-1">
                      <Check className="w-3 h-3" />
                      <span>Email Verified</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>Email Pending</span>
                    </span>
                  )}
                </div>

                {!isEmailVerified && (
                  <div className="space-y-2">
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={signupEmailOtp}
                        onChange={(e) =>
                          setSignupEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        placeholder="6-digit Email OTP"
                        className="flex-1 font-mono tracking-widest text-center text-xs font-bold px-3 py-1.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <button
                        type="button"
                        onClick={handleVerifySignupEmail}
                        disabled={emailVerifyLoading || signupEmailOtp.length !== 6}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition"
                      >
                        {emailVerifyLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          'Verify'
                        )}
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Expires in 10 mins</span>
                      {emailResendCooldown > 0 ? (
                        <span className="text-slate-400">
                          Resend in {emailResendCooldown}s
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={handleResendSignupEmail}
                          className="font-bold text-sky-600 hover:underline flex items-center space-x-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Resend Email OTP</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* CARD 2: MOBILE OTP */}
              <div
                className={`p-3 rounded-2xl border transition ${
                  isPhoneVerified
                    ? 'bg-emerald-50/60 border-emerald-200'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center space-x-1.5">
                    <Smartphone className="w-3.5 h-3.5 text-slate-500" />
                    <span className="text-xs font-bold text-slate-800">
                      Mobile: {signupMaskedPhone}
                    </span>
                  </div>
                  {isPhoneVerified ? (
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center space-x-1">
                      <Check className="w-3 h-3" />
                      <span>Mobile Verified</span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full flex items-center space-x-1">
                      <Clock className="w-3 h-3" />
                      <span>Mobile Pending</span>
                    </span>
                  )}
                </div>

                {!isPhoneVerified && (
                  <div className="space-y-2">
                    <div className="flex space-x-2">
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={6}
                        value={signupPhoneOtp}
                        onChange={(e) =>
                          setSignupPhoneOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        placeholder="6-digit Mobile OTP"
                        className="flex-1 font-mono tracking-widest text-center text-xs font-bold px-3 py-1.5 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-sky-500"
                      />
                      <button
                        type="button"
                        onClick={handleVerifySignupPhone}
                        disabled={phoneVerifyLoading || signupPhoneOtp.length !== 6}
                        className="px-3 py-1.5 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl transition"
                      >
                        {phoneVerifyLoading ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          'Verify'
                        )}
                      </button>
                    </div>

                    <div className="flex items-center justify-between text-[11px] text-slate-500">
                      <span>Expires in 10 mins</span>
                      {phoneResendCooldown > 0 ? (
                        <span className="text-slate-400">
                          Resend in {phoneResendCooldown}s
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={handleResendSignupPhone}
                          className="font-bold text-sky-600 hover:underline flex items-center space-x-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Resend Mobile OTP</span>
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Requirement 3: Only enable final button when both are verified */}
              <button
                type="button"
                onClick={handleCompleteSignup}
                disabled={loading || !isEmailVerified || !isPhoneVerified}
                className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-xl shadow-md transition active:scale-95 flex items-center justify-center space-x-2"
              >
                {loading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    <span>
                      {isEmailVerified && isPhoneVerified
                        ? 'Create Account'
                        : 'Verify Both OTPs to Create Account'}
                    </span>
                  </>
                )}
              </button>
            </div>
          )}

          {/* VIEW: FORGOT PASSWORD - STEP 1 */}
          {view === 'forgot-identifier' && (
            <form onSubmit={handleForgotRequestOtp} className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Enter your registered <strong>email address</strong> or{' '}
                <strong>mobile number</strong>. We will send a secure 6-digit OTP
                to reset your password.
              </p>

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

          {/* VIEW: FORGOT PASSWORD - STEP 2 */}
          {view === 'forgot-otp' && (
            <form onSubmit={handleForgotVerifyOtp} className="space-y-4">
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

              <div className="flex items-center justify-between text-xs pt-1">
                <span className="text-slate-500">Didn't receive code?</span>
                {forgotResendCooldown > 0 ? (
                  <span className="text-slate-400 font-medium">
                    Resend OTP in <strong className="text-slate-600">{forgotResendCooldown}s</strong>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleForgotRequestOtp()}
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

          {/* VIEW: FORGOT PASSWORD - STEP 3 */}
          {view === 'forgot-reset' && (
            <form onSubmit={handleForgotResetPassword} className="space-y-4">
              <p className="text-xs text-slate-600 leading-relaxed">
                Choose a strong new password for your account (minimum 12 characters with uppercase, lowercase, digit, and symbol).
              </p>

              <PasswordInput
                id="reset-new-password"
                label="New Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="At least 12 characters"
              />

              <PasswordInput
                id="reset-confirm-password"
                label="Confirm Password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                autoComplete="new-password"
                placeholder="Repeat new password"
              />

              <PasswordChecklist
                password={newPassword}
                confirmPassword={confirmPassword}
              />

              <button
                type="submit"
                disabled={loading || !isPasswordValid(newPassword, confirmPassword)}
                className="w-full py-2.5 bg-sky-600 hover:bg-sky-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-xl shadow-md shadow-sky-600/20 transition active:scale-95 flex items-center justify-center space-x-2"
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
