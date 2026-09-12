export interface PasswordRules {
  minLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
}

export interface PasswordValidationResult {
  isValid: boolean;
  errors: string[];
  rules: PasswordRules;
}

/**
 * Validate password against production security policy:
 * - Minimum 12 characters
 * - At least 1 uppercase letter
 * - At least 1 lowercase letter
 * - At least 1 numeric digit
 * - At least 1 special character (supports standard password-manager symbols: !@#$%^&*()_+-=[]{}:;'",.?/ etc.)
 */
export function validatePassword(password: string): PasswordValidationResult {
  const str = password || '';

  const rules: PasswordRules = {
    minLength: str.length >= 12,
    hasUpper: /[A-Z]/.test(str),
    hasLower: /[a-z]/.test(str),
    hasNumber: /[0-9]/.test(str),
    hasSpecial: /[!@#$%^&*()_+\-=[\]{}:;'"\\|,.<>/?`~]/.test(str),
  };

  const errors: string[] = [];
  if (!rules.minLength) {
    errors.push('Password must be at least 12 characters long.');
  }
  if (!rules.hasUpper) {
    errors.push('Password must contain at least one uppercase letter (A-Z).');
  }
  if (!rules.hasLower) {
    errors.push('Password must contain at least one lowercase letter (a-z).');
  }
  if (!rules.hasNumber) {
    errors.push('Password must contain at least one number (0-9).');
  }
  if (!rules.hasSpecial) {
    errors.push('Password must contain at least one special character (!@#$%^&* etc.).');
  }

  return {
    isValid: Object.values(rules).every(Boolean),
    errors,
    rules,
  };
}

/**
 * Validate password and matching confirmation
 */
export function validatePasswordConfirmation(
  password: string,
  confirmPassword?: string
): { isValid: boolean; error?: string } {
  const baseValidation = validatePassword(password);
  if (!baseValidation.isValid) {
    return {
      isValid: false,
      error: baseValidation.errors[0],
    };
  }

  if (confirmPassword !== undefined && password !== confirmPassword) {
    return {
      isValid: false,
      error: 'Passwords do not match.',
    };
  }

  return { isValid: true };
}
