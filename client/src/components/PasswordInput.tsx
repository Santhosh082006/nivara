import React, { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';

interface PasswordInputProps {
  id?: string;
  name?: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder?: string;
  label?: string;
  required?: boolean;
  disabled?: boolean;
  autoComplete?: string;
  className?: string;
  error?: string | null;
}

export const PasswordInput: React.FC<PasswordInputProps> = ({
  id,
  name,
  value,
  onChange,
  placeholder = '••••••••••••',
  label,
  required = false,
  disabled = false,
  autoComplete = 'current-password',
  className = '',
  error,
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={`space-y-1 ${className}`}>
      {label && (
        <label
          htmlFor={id}
          className="block text-xs font-bold uppercase tracking-wider text-slate-500"
        >
          {label} {required && <span className="text-rose-500">*</span>}
        </label>
      )}
      <div className="relative">
        <input
          id={id}
          name={name}
          type={showPassword ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          required={required}
          disabled={disabled}
          autoComplete={autoComplete}
          placeholder={placeholder}
          className={`w-full pl-8 pr-10 py-2 bg-slate-50 border ${
            error ? 'border-rose-400 focus:ring-rose-400' : 'border-slate-200 focus:ring-sky-500'
          } rounded-xl text-xs text-slate-800 focus:outline-none focus:ring-2 transition disabled:opacity-50`}
        />
        <Lock className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5 pointer-events-none" />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          tabIndex={-1}
          aria-label={showPassword ? 'Hide password' : 'Show password'}
          className="absolute right-2.5 top-2 text-slate-400 hover:text-slate-600 p-0.5 rounded focus:outline-none focus:text-sky-600 transition"
        >
          {showPassword ? (
            <EyeOff className="w-3.5 h-3.5" />
          ) : (
            <Eye className="w-3.5 h-3.5" />
          )}
        </button>
      </div>
      {error && <p className="text-[11px] text-rose-500">{error}</p>}
    </div>
  );
};
