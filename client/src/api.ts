import {
  IssueCategory,
  IssueCluster,
  NearbyClusterCheckResult,
  User,
} from './types';

const API_BASE = '/api';

export function getAuthToken(): string | null {
  return localStorage.getItem('nivara_token');
}

export function setAuthToken(token: string): void {
  localStorage.setItem('nivara_token', token);
}

export function clearAuthToken(): void {
  localStorage.removeItem('nivara_token');
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = getAuthToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  let data: any = {};
  const text = await response.text();
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text || `HTTP ${response.status} ${response.statusText}` };
  }

  if (!response.ok) {
    throw new Error(data.message || 'API request failed');
  }

  return data;
}

// Auth API
export async function registerUser(payload: {
  name: string;
  email: string;
  password: string;
  role?: string;
  phone?: string;
}): Promise<{ success: boolean; data: { user: User; token: string } }> {
  return request('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

// Dual OTP Signup Verification API
export async function startSignup(payload: {
  name: string;
  email: string;
  phone: string;
  password: string;
  confirmPassword?: string;
  role: string;
}): Promise<{
  success: boolean;
  message: string;
  data: {
    sessionId: string;
    maskedEmail: string;
    maskedPhone: string;
  };
}> {
  return request('/auth/signup/start', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifySignupOtp(payload: {
  sessionId: string;
  type: 'email' | 'phone';
  otp: string;
}): Promise<{
  success: boolean;
  message: string;
  data: {
    isEmailVerified: boolean;
    isPhoneVerified: boolean;
    bothVerified: boolean;
  };
}> {
  return request('/auth/signup/verify-otp', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function resendSignupOtp(payload: {
  sessionId: string;
  type: 'email' | 'phone';
}): Promise<{
  success: boolean;
  message: string;
}> {
  return request('/auth/signup/resend-otp', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function completeSignup(payload: {
  sessionId: string;
  name: string;
  password: string;
  confirmPassword?: string;
  role: string;
}): Promise<{
  success: boolean;
  message: string;
  data: {
    user: User;
  };
}> {
  return request('/auth/signup/complete', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export interface LoginChallengeResponse {
  success: boolean;
  message: string;
  data: {
    requiresOtp: boolean;
    loginChallengeToken: string;
    channel: 'email' | 'phone';
    maskedDestination: string;
  };
}

export async function loginUser(payload: {
  identifier?: string;
  email?: string;
  password: string;
}): Promise<LoginChallengeResponse> {
  return request('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function verifyLoginOtp(payload: {
  loginChallengeToken: string;
  otp: string;
}): Promise<{ success: boolean; message: string; data: { user: User; token: string } }> {
  return request('/auth/login/verify-otp', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function resendLoginOtp(payload: {
  loginChallengeToken: string;
}): Promise<{ success: boolean; message: string }> {
  return request('/auth/login/resend-otp', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getCurrentUser(): Promise<{
  success: boolean;
  data: { user: User };
}> {
  return request('/auth/me');
}

export async function requestPasswordReset(identifier: string): Promise<{
  success: boolean;
  message: string;
  data?: {
    destinationType?: 'email' | 'phone';
    maskedDestination?: string;
  };
}> {
  return request('/auth/password-reset/request', {
    method: 'POST',
    body: JSON.stringify({ identifier }),
  });
}

export async function resendResetOtp(identifier: string): Promise<{
  success: boolean;
  message: string;
}> {
  return request('/auth/password-reset/resend-otp', {
    method: 'POST',
    body: JSON.stringify({ identifier }),
  });
}

export async function verifyResetOtp(
  identifier: string,
  otp: string
): Promise<{
  success: boolean;
  message: string;
  data: { resetToken: string; passwordResetToken?: string };
}> {
  return request('/auth/password-reset/verify-otp', {
    method: 'POST',
    body: JSON.stringify({ identifier, otp }),
  });
}

export async function resetPassword(
  resetToken: string,
  newPassword: string,
  confirmPassword?: string
): Promise<{
  success: boolean;
  message: string;
}> {
  return request('/auth/password-reset/reset', {
    method: 'POST',
    body: JSON.stringify({ resetToken, passwordResetToken: resetToken, newPassword, confirmPassword }),
  });
}


// Clusters API
export async function fetchClusters(params?: {
  bounds?: string;
  category?: string;
  status?: string;
}): Promise<{ success: boolean; count: number; data: { clusters: IssueCluster[] } }> {
  const query = new URLSearchParams();
  if (params?.bounds) query.set('bounds', params.bounds);
  if (params?.category) query.set('category', params.category);
  if (params?.status) query.set('status', params.status);

  const qs = query.toString();
  return request(`/clusters${qs ? `?${qs}` : ''}`);
}

export async function checkNearbyCluster(
  lat: number,
  lng: number,
  category: IssueCategory
): Promise<{ success: boolean; data: NearbyClusterCheckResult }> {
  return request(`/clusters/nearby?lat=${lat}&lng=${lng}&category=${category}`);
}

export async function fetchTopClusters(params?: {
  limit?: number;
  status?: string;
  category?: string;
}): Promise<{ success: boolean; data: { topClusters: IssueCluster[] } }> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.status) query.set('status', params.status);
  if (params?.category) query.set('category', params.category);

  const qs = query.toString();
  return request(`/clusters/top${qs ? `?${qs}` : ''}`);
}

export async function fetchClusterDetails(
  id: string
): Promise<{ success: boolean; data: { cluster: IssueCluster } }> {
  return request(`/clusters/${id}`);
}

export async function upvoteClusterApi(
  id: string
): Promise<{ success: boolean; message: string; data: { cluster: IssueCluster } }> {
  return request(`/clusters/${id}/upvote`, {
    method: 'POST',
  });
}

export async function updateClusterStatusApi(
  id: string,
  status: string
): Promise<{ success: boolean; message: string; data: { cluster: IssueCluster } }> {
  return request(`/clusters/${id}/status`, {
    method: 'PATCH',
    body: JSON.stringify({ status }),
  });
}

// Complaint Submission API
export async function submitComplaintApi(payload: {
  category: IssueCategory;
  description: string;
  latitude: number;
  longitude: number;
  imageUrl?: string;
}): Promise<{
  success: boolean;
  message: string;
  data: {
    complaint: any;
    cluster: IssueCluster;
    isNewCluster: boolean;
    distanceToCentroid: number;
  };
}> {
  return request('/complaints', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
