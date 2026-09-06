import { IssueCategory, IssueCluster, Prisma } from '@prisma/client';
import { prisma } from '../config/db';
import {
  calculateHaversineDistance,
  calculateBoundingBox,
  recomputeCentroidIncremental,
  Coordinates,
} from './haversine';
import {
  DEFAULT_CLUSTER_DISTANCE_THRESHOLD_METERS,
  CATEGORY_PRIORITY_WEIGHTS,
} from '../config/constants';

export interface CandidateClusterResult {
  cluster: IssueCluster;
  distance: number;
}

export interface IngestComplaintInput {
  userId: string;
  category: IssueCategory;
  description: string;
  imageUrl?: string | null;
  latitude: number;
  longitude: number;
}

export interface ClusteredComplaintOutput {
  complaint: {
    id: string;
    userId: string;
    category: IssueCategory;
    description: string;
    imageUrl?: string | null;
    latitude: number;
    longitude: number;
    status: string;
    createdAt: Date;
  };
  cluster: IssueCluster;
  isNewCluster: boolean;
  distanceToCentroid: number;
}

/**
 * Calculates priority score for an issue cluster based on report count,
 * community upvotes, and category hazard weight.
 */
export function calculatePriorityScore(
  reportCount: number,
  upvotes: number,
  category: IssueCategory
): number {
  const categoryWeight = CATEGORY_PRIORITY_WEIGHTS[category] ?? 2;
  return reportCount * 2.0 + upvotes * 1.0 + categoryWeight;
}

/**
 * Scans active clusters matching the category within a bounding box,
 * then evaluates exact Haversine distance and resolves ties.
 */
export async function findNearbyClusterCandidate(
  coordinates: Coordinates,
  category: IssueCategory,
  thresholdMeters: number = DEFAULT_CLUSTER_DISTANCE_THRESHOLD_METERS,
  tx: Prisma.TransactionClient = prisma
): Promise<CandidateClusterResult | null> {
  // Step 1: Spatial Bounding-Box Pre-Filter (O(1) indexed pruning)
  const bbox = calculateBoundingBox(coordinates, thresholdMeters);

  const candidateClusters = await tx.issueCluster.findMany({
    where: {
      category,
      status: { in: ['OPEN', 'IN_PROGRESS'] },
      centroidLat: {
        gte: bbox.minLat,
        lte: bbox.maxLat,
      },
      centroidLng: {
        gte: bbox.minLng,
        lte: bbox.maxLng,
      },
    },
  });

  if (candidateClusters.length === 0) {
    return null;
  }

  // Step 2: Accurate Haversine Evaluation & Distance Filtering
  const matchingCandidates: CandidateClusterResult[] = [];

  for (const cluster of candidateClusters) {
    const distance = calculateHaversineDistance(coordinates, {
      latitude: cluster.centroidLat,
      longitude: cluster.centroidLng,
    });

    if (distance <= thresholdMeters) {
      matchingCandidates.push({ cluster, distance });
    }
  }

  if (matchingCandidates.length === 0) {
    return null;
  }

  // Step 3: Equidistant Tie-Breaking Logic
  // Primary: Closest distance
  // Secondary: Higher existing reportCount (gravitational attraction to larger cluster)
  // Tertiary: Earliest creation timestamp (FIFO stability)
  matchingCandidates.sort((a, b) => {
    if (Math.abs(a.distance - b.distance) > 0.05) {
      return a.distance - b.distance;
    }
    if (b.cluster.reportCount !== a.cluster.reportCount) {
      return b.cluster.reportCount - a.cluster.reportCount;
    }
    return a.cluster.createdAt.getTime() - b.cluster.createdAt.getTime();
  });

  return matchingCandidates[0];
}

/**
 * Checks if the updated cluster's centroid now lies within threshold distance of
 * another active cluster of the same category, and merges them to prevent splintering.
 *
 * This resolves the "ingestion-order dependency" edge case where two initial complaints
 * started on opposite edges of a physical hotspot (>50m apart) and later drifted together.
 */
export async function mergeAdjacentClusters(
  clusterId: string,
  thresholdMeters: number = DEFAULT_CLUSTER_DISTANCE_THRESHOLD_METERS,
  tx: Prisma.TransactionClient = prisma
): Promise<IssueCluster> {
  let currentCluster: IssueCluster | null = await tx.issueCluster.findUnique({
    where: { id: clusterId },
  });
  if (!currentCluster) {
    throw new Error(`Cluster with ID ${clusterId} not found`);
  }

  let mergedAny = true;
  while (mergedAny && currentCluster) {
    mergedAny = false;
    const current: IssueCluster = currentCluster;

    // Spatial bounding box for other active clusters of same category
    const bbox = calculateBoundingBox(
      { latitude: current.centroidLat, longitude: current.centroidLng },
      thresholdMeters
    );

    const candidates = await tx.issueCluster.findMany({
      where: {
        id: { not: current.id },
        category: current.category,
        status: { in: ['OPEN', 'IN_PROGRESS'] },
        centroidLat: { gte: bbox.minLat, lte: bbox.maxLat },
        centroidLng: { gte: bbox.minLng, lte: bbox.maxLng },
      },
    });

    for (const other of candidates) {
      const distance = calculateHaversineDistance(
        { latitude: current.centroidLat, longitude: current.centroidLng },
        { latitude: other.centroidLat, longitude: other.centroidLng }
      );

      if (distance <= thresholdMeters) {
        // Larger cluster absorbs the smaller one; if equal, older cluster survives
        const currentIsSurvivor: boolean =
          current.reportCount > other.reportCount ||
          (current.reportCount === other.reportCount &&
            current.createdAt.getTime() <= other.createdAt.getTime());

        const survivor: IssueCluster = currentIsSurvivor ? current : other;
        const absorbed: IssueCluster = currentIsSurvivor ? other : current;

        console.log(
          `  [Cluster Merge] 🔀 Drift detected! Merging cluster ${absorbed.id.slice(0, 8)} (${absorbed.reportCount} reports) into cluster ${survivor.id.slice(0, 8)} (${survivor.reportCount} reports). Centroid distance: ${distance}m`
        );

        // Calculate combined weighted centroid
        const totalReports: number = survivor.reportCount + absorbed.reportCount;
        const combinedLat: number =
          (survivor.centroidLat * survivor.reportCount + absorbed.centroidLat * absorbed.reportCount) /
          totalReports;
        const combinedLng: number =
          (survivor.centroidLng * survivor.reportCount + absorbed.centroidLng * absorbed.reportCount) /
          totalReports;

        // Reassign all member complaints from absorbed to survivor
        await tx.clusterMembership.updateMany({
          where: { clusterId: absorbed.id },
          data: { clusterId: survivor.id },
        });

        // Reassign upvotes from absorbed to survivor (deduplicating user upvotes)
        const absorbedUpvotes = await tx.upvote.findMany({ where: { clusterId: absorbed.id } });
        for (const upvote of absorbedUpvotes) {
          const alreadyUpvotedSurvivor = await tx.upvote.findUnique({
            where: {
              userId_clusterId: {
                userId: upvote.userId,
                clusterId: survivor.id,
              },
            },
          });

          if (!alreadyUpvotedSurvivor) {
            await tx.upvote.update({
              where: { id: upvote.id },
              data: { clusterId: survivor.id },
            });
          } else {
            await tx.upvote.delete({ where: { id: upvote.id } });
          }
        }

        const distinctUpvotes = await tx.upvote.count({ where: { clusterId: survivor.id } });
        const newPriorityScore = calculatePriorityScore(
          totalReports,
          distinctUpvotes,
          survivor.category
        );

        // Update survivor cluster record
        const updatedSurvivor: IssueCluster = await tx.issueCluster.update({
          where: { id: survivor.id },
          data: {
            centroidLat: Math.round(combinedLat * 1e7) / 1e7,
            centroidLng: Math.round(combinedLng * 1e7) / 1e7,
            reportCount: totalReports,
            upvotes: distinctUpvotes,
            priorityScore: newPriorityScore,
            updatedAt: new Date(),
          },
        });

        // Delete absorbed cluster
        await tx.issueCluster.delete({ where: { id: absorbed.id } });

        currentCluster = updatedSurvivor;
        mergedAny = true;
        break; // Re-evaluate bounding box with the newly combined centroid
      }
    }
  }

  return currentCluster!;
}

/**
 * Ingests a new complaint into the database atomically:
 * Either assigns the complaint to an existing cluster within 50m and updates its centroid,
 * or creates a new cluster initialized at the complaint's coordinates.
 * Automatically checks and merges adjacent clusters if centroid drift brings them within 50m.
 */
export async function ingestAndClusterComplaint(
  input: IngestComplaintInput,
  thresholdMeters: number = DEFAULT_CLUSTER_DISTANCE_THRESHOLD_METERS
): Promise<ClusteredComplaintOutput> {
  const { userId, category, description, imageUrl, latitude, longitude } = input;
  const coordinates: Coordinates = { latitude, longitude };

  return await prisma.$transaction(async (tx) => {
    // Check for nearby matching cluster
    const match = await findNearbyClusterCandidate(coordinates, category, thresholdMeters, tx);

    if (match) {
      const existingCluster = match.cluster;
      const distance = match.distance;

      // Recompute centroid dynamically
      const updatedCentroid = recomputeCentroidIncremental(
        { latitude: existingCluster.centroidLat, longitude: existingCluster.centroidLng },
        existingCluster.reportCount,
        coordinates
      );

      const nextReportCount = existingCluster.reportCount + 1;
      const nextPriorityScore = calculatePriorityScore(
        nextReportCount,
        existingCluster.upvotes,
        category
      );

      // 1. Update cluster record
      await tx.issueCluster.update({
        where: { id: existingCluster.id },
        data: {
          centroidLat: updatedCentroid.latitude,
          centroidLng: updatedCentroid.longitude,
          reportCount: nextReportCount,
          priorityScore: nextPriorityScore,
          updatedAt: new Date(),
        },
      });

      // 2. Create complaint record
      const complaint = await tx.complaint.create({
        data: {
          userId,
          category,
          description,
          imageUrl,
          latitude,
          longitude,
          status: 'CLUSTERED',
        },
      });

      // 3. Create membership association
      await tx.clusterMembership.create({
        data: {
          clusterId: existingCluster.id,
          complaintId: complaint.id,
          distanceToCentroid: distance,
        },
      });

      // 4. Check if centroid drift brought this cluster within 50m of another cluster
      const finalCluster = await mergeAdjacentClusters(existingCluster.id, thresholdMeters, tx);

      return {
        complaint,
        cluster: finalCluster,
        isNewCluster: false,
        distanceToCentroid: distance,
      };
    } else {
      // Create new cluster
      const initialPriorityScore = calculatePriorityScore(1, 0, category);

      const newCluster = await tx.issueCluster.create({
        data: {
          category,
          centroidLat: latitude,
          centroidLng: longitude,
          reportCount: 1,
          upvotes: 0,
          status: 'OPEN',
          priorityScore: initialPriorityScore,
        },
      });

      // Create complaint record
      const complaint = await tx.complaint.create({
        data: {
          userId,
          category,
          description,
          imageUrl,
          latitude,
          longitude,
          status: 'CLUSTERED',
        },
      });

      // Create membership association
      await tx.clusterMembership.create({
        data: {
          clusterId: newCluster.id,
          complaintId: complaint.id,
          distanceToCentroid: 0.0,
        },
      });

      // Check if newly created cluster immediately merges with an adjacent cluster
      const finalCluster = await mergeAdjacentClusters(newCluster.id, thresholdMeters, tx);

      return {
        complaint,
        cluster: finalCluster,
        isNewCluster: finalCluster.id === newCluster.id,
        distanceToCentroid: 0.0,
      };
    }
  });
}
