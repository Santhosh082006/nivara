export type Role = 'CITIZEN' | 'AUTHORITY' | 'ADMIN';

export type IssueCategory =
  | 'POTHOLE'
  | 'GARBAGE_DUMP'
  | 'STREETLIGHT'
  | 'WATER_LEAKAGE'
  | 'OPEN_SEWAGE'
  | 'FOOTPATH_OBSTRUCTION'
  | 'OTHER';

export type ClusterStatus = 'OPEN' | 'IN_PROGRESS' | 'RESOLVED';

export interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  phone?: string;
  createdAt: string;
}

export interface Complaint {
  id: string;
  userId: string;
  category: IssueCategory;
  description: string;
  imageUrl?: string | null;
  latitude: number;
  longitude: number;
  status: string;
  createdAt: string;
  user?: {
    name: string;
  };
}

export interface ClusterMembership {
  id: string;
  clusterId: string;
  complaintId: string;
  distanceToCentroid: number;
  joinedAt: string;
  complaint: Complaint;
}

export interface IssueCluster {
  id: string;
  category: IssueCategory;
  centroidLat: number;
  centroidLng: number;
  reportCount: number;
  upvotes: number;
  status: ClusterStatus;
  priorityScore: number;
  createdAt: string;
  updatedAt: string;
  memberships?: ClusterMembership[];
  _count?: {
    memberships: number;
    upvoteRecords: number;
  };
}

export interface NearbyClusterCheckResult {
  hasNearbyCluster: boolean;
  cluster: IssueCluster | null;
  distanceMeters: number | null;
  recentComplaints?: {
    description: string;
    imageUrl?: string | null;
    createdAt: string;
  }[];
}
