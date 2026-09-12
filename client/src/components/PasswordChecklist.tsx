import React from 'react';
import { Check, Circle } from 'lucide-react';

export interface PasswordRuleCheck {
  minLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
  match?: boolean;
}

export function evaluatePasswordRules(
  password: string,
  confirmPassword?: string
): PasswordRuleCheck {
  const str = password || '';
  const result: PasswordRuleCheck = {
    minLength: str.length >= 12,
    hasUpper: /[A-Z]/.test(str),
    hasLower: /[a-z]/.test(str),
    hasNumber: /[0-9]/.test(str),
    hasSpecial: /[!@#$%^&*()_+\-=[\]{}:;'"\\|,.<>/?`~]/.test(str),
  };

  if (confirmPassword !== undefined) {
    result.match = str.length > 0 && str === confirmPassword;
  }

  return result;
}

export function isPasswordValid(password: string, confirmPassword?: string): boolean {
  const rules = evaluatePasswordRules(password, confirmPassword);
  const baseValid =
    rules.minLength &&
    rules.hasUpper &&
    rules.hasLower &&
    rules.hasNumber &&
    rules.hasSpecial;

  if (confirmPassword !== undefined) {
    return baseValid && Boolean(rules.match);
  }

  return baseValid;
}

interface PasswordChecklistProps {
  password: string;
  confirmPassword?: string;
  className?: string;
}

export const PasswordChecklist: React.FC<PasswordChecklistProps> = ({
  password,
  confirmPassword,
  className = '',
}) => {
  const rules = evaluatePasswordRules(password, confirmPassword);

  const items = [
    { label: 'At least 12 characters', valid: rules.minLength },
    { label: 'One uppercase letter (A-Z)', valid: rules.hasUpper },
    { label: 'One lowercase letter (a-z)', valid: rules.hasLower },
    { label: 'One number (0-9)', valid: rules.hasNumber },
    { label: 'One special character (!@#$%^&* etc.)', valid: rules.hasSpecial },
  ];

  if (confirmPassword !== undefined) {
    items.push({
      label: 'Passwords match',
      valid: Boolean(rules.match),
    });
  }

  return (
    <div
      className={`p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] space-y-1.5 transition-all ${className}`}
    >
      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
        Password Requirements
      </div>
      <div className="grid grid-cols-1 gap-1">
        {items.map((item, idx) => (
          <div
            key={idx}
            className={`flex items-center space-x-1.5 transition-colors ${
              item.valid ? 'text-emerald-600 font-medium' : 'text-slate-400'
            }`}
          >
            {item.valid ? (
              <Check className="w-3 h-3 text-emerald-500 shrink-0" />
            ) : (
              <Circle className="w-2.5 h-2.5 text-slate-300 shrink-0" />
            )}
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
