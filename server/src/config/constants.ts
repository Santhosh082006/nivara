// Application Constants & Geospatial Thresholds

export const DEFAULT_CLUSTER_DISTANCE_THRESHOLD_METERS = 50.0;

// Earth radius in meters (WGS-84 mean radius)
export const EARTH_RADIUS_METERS = 6371000;

// Category urgency weights for composite priority score calculation:
// Priority Score = (reportCount * 2.0) + (upvotes * 1.0) + CategoryWeight
export const CATEGORY_PRIORITY_WEIGHTS: Record<string, number> = {
  OPEN_SEWAGE: 10,
  WATER_LEAKAGE: 8,
  POTHOLE: 6,
  GARBAGE_DUMP: 5,
  STREETLIGHT: 4,
  FOOTPATH_OBSTRUCTION: 3,
  OTHER: 2,
};

export const SUPPORTED_CATEGORIES = [
  'POTHOLE',
  'GARBAGE_DUMP',
  'STREETLIGHT',
  'WATER_LEAKAGE',
  'OPEN_SEWAGE',
  'FOOTPATH_OBSTRUCTION',
  'OTHER',
] as const;

export type SupportedCategory = typeof SUPPORTED_CATEGORIES[number];
