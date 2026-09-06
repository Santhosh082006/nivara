import {
  calculateHaversineDistance,
  calculateBoundingBox,
  recomputeCentroidIncremental,
  calculateCentroidFromPoints,
  Coordinates,
} from '../clustering/haversine';
import { DEFAULT_CLUSTER_DISTANCE_THRESHOLD_METERS } from '../config/constants';

describe('Geospatial Clustering Algorithm - Core Mathematical Unit Tests', () => {
  // Test coordinates: Bangalore MG Road / Brigade Road junction area
  const brigadeRoad: Coordinates = { latitude: 12.973826, longitude: 77.607471 };
  
  // Point approximately 25 meters east along Brigade Road
  const point25m: Coordinates = { latitude: 12.973826, longitude: 77.607701 };

  // Point approximately 48 meters away (inside 50m threshold)
  const point48m: Coordinates = { latitude: 12.974150, longitude: 77.607720 };

  // Point approximately 85 meters away (outside 50m threshold)
  const point85m: Coordinates = { latitude: 12.974400, longitude: 77.608000 };

  describe('Haversine Distance Formula', () => {
    it('returns 0 meters when comparing identical coordinates', () => {
      const distance = calculateHaversineDistance(brigadeRoad, brigadeRoad);
      expect(distance).toBe(0);
    });

    it('calculates accurate short-range street distances', () => {
      const distance = calculateHaversineDistance(brigadeRoad, point25m);
      // Expected ~25m (allow small tolerance of +-2m)
      expect(distance).toBeGreaterThan(20);
      expect(distance).toBeLessThan(30);
    });

    it('correctly discriminates within vs outside the 50m threshold', () => {
      const distInside = calculateHaversineDistance(brigadeRoad, point48m);
      const distOutside = calculateHaversineDistance(brigadeRoad, point85m);

      expect(distInside).toBeLessThanOrEqual(DEFAULT_CLUSTER_DISTANCE_THRESHOLD_METERS);
      expect(distOutside).toBeGreaterThan(DEFAULT_CLUSTER_DISTANCE_THRESHOLD_METERS);
    });

    it('is symmetric: distance(A, B) === distance(B, A)', () => {
      const d1 = calculateHaversineDistance(brigadeRoad, point85m);
      const d2 = calculateHaversineDistance(point85m, brigadeRoad);
      expect(d1).toBe(d2);
    });

    it('calculates known long-range distance accurately (Bangalore to Mysore ~128km)', () => {
      const bangalore: Coordinates = { latitude: 12.9716, longitude: 77.5946 };
      const mysore: Coordinates = { latitude: 12.2958, longitude: 76.6394 };

      const distanceKm = calculateHaversineDistance(bangalore, mysore) / 1000;
      // Actual geodesic distance is ~128.5 km
      expect(distanceKm).toBeGreaterThan(127);
      expect(distanceKm).toBeLessThan(130);
    });
  });

  describe('Spatial Bounding-Box Pre-Filter', () => {
    it('generates a bounding box that completely encloses points within the radius', () => {
      const bbox = calculateBoundingBox(brigadeRoad, 50.0);

      expect(bbox.minLat).toBeLessThan(brigadeRoad.latitude);
      expect(bbox.maxLat).toBeGreaterThan(brigadeRoad.latitude);
      expect(bbox.minLng).toBeLessThan(brigadeRoad.longitude);
      expect(bbox.maxLng).toBeGreaterThan(brigadeRoad.longitude);

      // point25m is within 25m, so it MUST be inside the 50m bounding box
      expect(point25m.latitude).toBeGreaterThanOrEqual(bbox.minLat);
      expect(point25m.latitude).toBeLessThanOrEqual(bbox.maxLat);
      expect(point25m.longitude).toBeGreaterThanOrEqual(bbox.minLng);
      expect(point25m.longitude).toBeLessThanOrEqual(bbox.maxLng);
    });

    it('excludes points known to be far outside the search radius', () => {
      const bbox = calculateBoundingBox(brigadeRoad, 50.0);
      const distantPoint: Coordinates = { latitude: 13.0000, longitude: 77.7000 };

      const isInside =
        distantPoint.latitude >= bbox.minLat &&
        distantPoint.latitude <= bbox.maxLat &&
        distantPoint.longitude >= bbox.minLng &&
        distantPoint.longitude <= bbox.maxLng;

      expect(isInside).toBe(false);
    });
  });

  describe('Centroid Recomputation', () => {
    it('computes exact midpoint for two points', () => {
      const p1: Coordinates = { latitude: 12.0, longitude: 77.0 };
      const p2: Coordinates = { latitude: 12.0002, longitude: 77.0004 };

      const centroid = recomputeCentroidIncremental(p1, 1, p2);

      expect(centroid.latitude).toBeCloseTo(12.0001, 5);
      expect(centroid.longitude).toBeCloseTo(77.0002, 5);
    });

    it('incremental calculation matches batch calculation over multiple points', () => {
      const points: Coordinates[] = [
        { latitude: 12.9710, longitude: 77.5910 },
        { latitude: 12.9712, longitude: 77.5913 },
        { latitude: 12.9708, longitude: 77.5909 },
        { latitude: 12.9714, longitude: 77.5911 },
      ];

      // Batch computation
      const batchCentroid = calculateCentroidFromPoints(points);

      // Incremental computation
      let incCentroid = points[0];
      for (let i = 1; i < points.length; i++) {
        incCentroid = recomputeCentroidIncremental(incCentroid, i, points[i]);
      }

      expect(incCentroid.latitude).toBeCloseTo(batchCentroid.latitude, 4);
      expect(incCentroid.longitude).toBeCloseTo(batchCentroid.longitude, 4);
    });
  });
});
