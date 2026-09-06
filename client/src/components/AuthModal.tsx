import React, { useState } from 'react';
import { X, Lock, Mail, User, Shield, AlertCircle, Loader2 } from 'lucide-react';
import { loginUser, registerUser, setAuthToken } from '../api';
import { User as UserType } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (user: UserType) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
}) => {
  const [isLogin, setIsLogin] = useState(true);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'CITIZEN' | 'AUTHORITY'>('CITIZEN');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isLogin) {
        const res = await loginUser({ email, password });
        setAuthToken(res.data.token);
        onAuthSuccess(res.data.user);
        onClose();
      } else {
        const res = await registerUser({ name, email, password, role });
        setAuthToken(res.data.token);
        onAuthSuccess(res.data.user);
        onClose();
      }
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (type: 'citizen' | 'authority') => {
    if (type === 'citizen') {
      setEmail('aarav@citizen.in');
      setPassword('password123');
      setIsLogin(true);
    } else {
      setEmail('authority@bbmp.gov.in');
      setPassword('password123');
      setIsLogin(true);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
          <h2 className="text-sm font-bold text-slate-900">
            {isLogin ? 'Sign In to Nivara' : 'Create Civic Account'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-700 rounded-full"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-xs font-semibold text-red-700 flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Demo Switchers */}
          <div className="bg-slate-50 p-2 rounded-xl border border-slate-100 text-center">
            <span className="text-[10px] uppercase font-bold text-slate-400 block mb-1.5">
              Quick Demo Fill
            </span>
            <div className="flex space-x-2">
              <button
                type="button"
                onClick={() => handleQuickFill('citizen')}
                className="flex-1 py-1 px-2 bg-white border border-slate-200 hover:border-sky-500 rounded-lg text-[11px] font-semibold text-slate-700 transition"
              >
                Citizen Demo
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('authority')}
                className="flex-1 py-1 px-2 bg-white border border-slate-200 hover:border-amber-500 rounded-lg text-[11px] font-semibold text-slate-700 transition"
              >
                Authority Demo
              </button>
            </div>
          </div>

          {!isLogin && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
                Full Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
          )}

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-sky-500"
            />
          </div>

          {!isLogin && (
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
                      ? 'bg-sky-50 border-sky-500 text-sky-900'
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
                      ? 'bg-amber-50 border-amber-500 text-amber-900'
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
            ) : isLogin ? (
              'Sign In'
            ) : (
              'Create Account'
            )}
          </button>

          <div className="text-center pt-2">
            <button
              type="button"
              onClick={() => setIsLogin(!isLogin)}
              className="text-xs text-slate-500 hover:text-sky-600 transition font-medium"
            >
              {isLogin
                ? "Don't have an account? Sign up"
                : 'Already have an account? Sign in'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
