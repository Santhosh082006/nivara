import { EARTH_RADIUS_METERS } from '../config/constants';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface BoundingBox {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Converts degrees to radians.
 */
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Converts radians to degrees.
 */
export function radiansToDegrees(radians: number): number {
  return (radians * 180) / Math.PI;
}

/**
 * Computes the geodesic distance between two coordinate pairs using the Haversine formula.
 *
 * Mathematical derivation:
 *   a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlng/2)
 *   c = 2 * atan2(√a, √(1-a))
 *   d = R * c
 *
 * @param pointA Starting coordinate { latitude, longitude }
 * @param pointB Ending coordinate { latitude, longitude }
 * @returns Geodesic distance in meters (rounded to 2 decimal places)
 */
export function calculateHaversineDistance(
  pointA: Coordinates,
  pointB: Coordinates
): number {
  const { latitude: lat1, longitude: lng1 } = pointA;
  const { latitude: lat2, longitude: lng2 } = pointB;

  // If points are identical, distance is zero
  if (lat1 === lat2 && lng1 === lng2) {
    return 0.0;
  }

  const phi1 = degreesToRadians(lat1);
  const phi2 = degreesToRadians(lat2);
  const deltaPhi = degreesToRadians(lat2 - lat1);
  const deltaLambda = degreesToRadians(lng2 - lng1);

  const sinHalfDeltaPhi = Math.sin(deltaPhi / 2);
  const sinHalfDeltaLambda = Math.sin(deltaLambda / 2);

  const a =
    sinHalfDeltaPhi * sinHalfDeltaPhi +
    Math.cos(phi1) * Math.cos(phi2) * sinHalfDeltaLambda * sinHalfDeltaLambda;

  // Clamp 'a' to [0, 1] to prevent NaN due to floating-point imprecision
  const clampedA = Math.min(Math.max(a, 0), 1);
  const c = 2 * Math.atan2(Math.sqrt(clampedA), Math.sqrt(1 - clampedA));

  const distanceMeters = EARTH_RADIUS_METERS * c;
  return Math.round(distanceMeters * 100) / 100;
}

/**
 * Generates a bounding box around a target coordinate given a distance threshold in meters.
 * Used for O(1) indexed spatial pre-filtering in database queries.
 *
 * @param center Target coordinate
 * @param radiusMeters Search radius in meters
 * @returns Bounding box with min/max latitudes and longitudes
 */
export function calculateBoundingBox(
  center: Coordinates,
  radiusMeters: number
): BoundingBox {
  const deltaLat = radiansToDegrees(radiusMeters / EARTH_RADIUS_METERS);
  
  // Latitude-adjusted longitudinal offset to account for meridian convergence
  const cosLat = Math.cos(degreesToRadians(center.latitude));
  // Safeguard against pole singularity
  const deltaLng = cosLat !== 0 
    ? radiansToDegrees(radiusMeters / (EARTH_RADIUS_METERS * Math.abs(cosLat)))
    : deltaLat;

  return {
    minLat: center.latitude - deltaLat,
    maxLat: center.latitude + deltaLat,
    minLng: center.longitude - deltaLng,
    maxLng: center.longitude + deltaLng,
  };
}

/**
 * Recomputes the cluster centroid when a new complaint point is added.
 * Uses incremental running average to guarantee constant-time O(1) updates.
 *
 * Formula:
 *   centroid_new = (centroid_old * currentCount + newPoint) / (currentCount + 1)
 *
 * @param currentCentroid Current centroid coordinate
 * @param currentCount Current number of reports in the cluster
 * @param newPoint Newly ingested complaint coordinate
 * @returns Updated centroid coordinate
 */
export function recomputeCentroidIncremental(
  currentCentroid: Coordinates,
  currentCount: number,
  newPoint: Coordinates
): Coordinates {
  if (currentCount <= 0) {
    return { latitude: newPoint.latitude, longitude: newPoint.longitude };
  }

  const nextCount = currentCount + 1;
  const newLat = (currentCentroid.latitude * currentCount + newPoint.latitude) / nextCount;
  const newLng = (currentCentroid.longitude * currentCount + newPoint.longitude) / nextCount;

  return {
    latitude: Math.round(newLat * 1e7) / 1e7,
    longitude: Math.round(newLng * 1e7) / 1e7,
  };
}

/**
 * Computes exact centroid from an arbitrary collection of coordinate points.
 *
 * @param points Array of coordinates
 * @returns Exact arithmetic mean centroid
 */
export function calculateCentroidFromPoints(points: Coordinates[]): Coordinates {
  if (points.length === 0) {
    throw new Error('Cannot compute centroid of an empty array of points');
  }

  const total = points.reduce(
    (acc, point) => ({
      lat: acc.lat + point.latitude,
      lng: acc.lng + point.longitude,
    }),
    { lat: 0, lng: 0 }
  );

  return {
    latitude: Math.round((total.lat / points.length) * 1e7) / 1e7,
    longitude: Math.round((total.lng / points.length) * 1e7) / 1e7,
  };
}
