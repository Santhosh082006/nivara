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

  const data = await response.json();

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

export async function loginUser(payload: {
  email: string;
  password: string;
}): Promise<{ success: boolean; data: { user: User; token: string } }> {
  return request('/auth/login', {
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
