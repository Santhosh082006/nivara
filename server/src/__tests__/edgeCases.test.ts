import {
  calculateHaversineDistance,
  Coordinates,
} from '../clustering/haversine';
import { DEFAULT_CLUSTER_DISTANCE_THRESHOLD_METERS } from '../config/constants';
import { prisma } from '../config/db';
import { ingestAndClusterComplaint } from '../clustering/clusterService';

describe('Geospatial Clustering - Boundary & Edge Case Analysis', () => {
  const basePoint: Coordinates = { latitude: 12.935242, longitude: 77.624461 }; // Koramangala 80ft Rd

  // 1 degree latitude ~ 111,139 meters. 50 meters ~ 0.00044988 degrees
  const metersToDeltaLat = (meters: number) => (meters / 6371000) * (180 / Math.PI);

  it('correctly includes a complaint located at 49.8 meters (strictly within threshold)', () => {
    const deltaLat = metersToDeltaLat(49.8);
    const testPoint: Coordinates = {
      latitude: basePoint.latitude + deltaLat,
      longitude: basePoint.longitude,
    };

    const dist = calculateHaversineDistance(basePoint, testPoint);
    expect(dist).toBeLessThanOrEqual(DEFAULT_CLUSTER_DISTANCE_THRESHOLD_METERS);
  });

  it('correctly rejects/separates a complaint located at 50.2 meters (strictly exceeding threshold)', () => {
    const deltaLat = metersToDeltaLat(50.2);
    const testPoint: Coordinates = {
      latitude: basePoint.latitude + deltaLat,
      longitude: basePoint.longitude,
    };

    const dist = calculateHaversineDistance(basePoint, testPoint);
    expect(dist).toBeGreaterThan(DEFAULT_CLUSTER_DISTANCE_THRESHOLD_METERS);
  });

  it('evaluates equidistant tie-breaking mathematically', () => {
    // Two cluster centroids placed 60 meters apart
    const delta = metersToDeltaLat(30.0);
    const clusterCentroidA: Coordinates = {
      latitude: basePoint.latitude - delta,
      longitude: basePoint.longitude,
    };
    const clusterCentroidB: Coordinates = {
      latitude: basePoint.latitude + delta,
      longitude: basePoint.longitude,
    };

    // Complaint point exactly in the middle (30 meters from each, both <= 50m)
    const distA = calculateHaversineDistance(basePoint, clusterCentroidA);
    const distB = calculateHaversineDistance(basePoint, clusterCentroidB);

    expect(Math.abs(distA - distB)).toBeLessThan(0.1);
    expect(distA).toBeLessThanOrEqual(DEFAULT_CLUSTER_DISTANCE_THRESHOLD_METERS);
    expect(distB).toBeLessThanOrEqual(DEFAULT_CLUSTER_DISTANCE_THRESHOLD_METERS);
  });

  it('handles antipodal and extreme coordinate inputs safely without NaN or crashes', () => {
    const northPole: Coordinates = { latitude: 90, longitude: 0 };
    const southPole: Coordinates = { latitude: -90, longitude: 0 };

    const distance = calculateHaversineDistance(northPole, southPole);
    // Half of Earth circumference: ~20,015 km = 20,015,000 meters
    expect(distance).toBeGreaterThan(20000000);
    expect(distance).toBeLessThan(20050000);
    expect(isNaN(distance)).toBe(false);
  });

  it('fuses two previously separate clusters when centroid drift brings them within 50m (Option B Dynamic Merge)', async () => {
    // Reset test DB
    await prisma.clusterMembership.deleteMany();
    await prisma.upvote.deleteMany();
    await prisma.complaint.deleteMany();
    await prisma.issueCluster.deleteMany();

    let user = await prisma.user.findFirst();
    if (!user) {
      user = await prisma.user.create({
        data: { name: 'Test User', email: 'test_merge@example.com', passwordHash: 'hash', role: 'CITIZEN' },
      });
    }

    // Complaint 1: Northern edge (+34m North of center)
    const c1 = await ingestAndClusterComplaint({
      userId: user.id,
      category: 'POTHOLE',
      description: 'North pothole report',
      latitude: 12.935549,
      longitude: 77.624452,
    });

    // Complaint 2: Southern edge (-34m South of center)
    // Distance from c1 is ~68m > 50m, so it initially MUST create a separate cluster
    const c2 = await ingestAndClusterComplaint({
      userId: user.id,
      category: 'POTHOLE',
      description: 'South pothole report',
      latitude: 12.934940,
      longitude: 77.624400,
    });

    expect(c1.cluster.id).not.toBe(c2.cluster.id);
    const countBefore = await prisma.issueCluster.count({ where: { category: 'POTHOLE' } });
    expect(countBefore).toBe(2);

    // Complaint 3: Near the north-center (12.935320, 77.624430)
    // Joins Cluster 1, pulling its centroid South to ~12.935434
    await ingestAndClusterComplaint({
      userId: user.id,
      category: 'POTHOLE',
      description: 'North-center pothole report',
      latitude: 12.935320,
      longitude: 77.624430,
    });

    // Complaint 4: Near the south-center (12.935100, 77.624420)
    // Joins Cluster 2, pulling its centroid North to ~12.935020.
    // The distance between the two centroids is now 46.2m <= 50m!
    // Option B dynamic merge triggers and fuses the two clusters into ONE!
    await ingestAndClusterComplaint({
      userId: user.id,
      category: 'POTHOLE',
      description: 'South-center pothole report',
      latitude: 12.935100,
      longitude: 77.624420,
    });

    // Check that Option B dynamic merge fused them into 1 single cluster with 4 reports!
    const finalClusters = await prisma.issueCluster.findMany({ where: { category: 'POTHOLE' } });
    expect(finalClusters.length).toBe(1);
    expect(finalClusters[0].reportCount).toBe(4);
  });
});
