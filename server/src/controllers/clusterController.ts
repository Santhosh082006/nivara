import { Request, Response } from 'express';
import { prisma } from '../config/db';
import {
  findNearbyClusterCandidate,
  calculatePriorityScore,
} from '../clustering/clusterService';
import { IssueCategory, ClusterStatus } from '@prisma/client';
import { DEFAULT_CLUSTER_DISTANCE_THRESHOLD_METERS } from '../config/constants';

/**
 * Get clusters with optional bounding box viewport filter and status/category filters
 * GET /api/clusters?bounds=minLat,minLng,maxLat,maxLng&category=...&status=...
 */
export async function getClusters(req: Request, res: Response): Promise<void> {
  try {
    const { bounds, category, status } = req.query;

    const where: any = {};

    if (category) {
      where.category = category as IssueCategory;
    }

    if (status) {
      where.status = status as ClusterStatus;
    }

    // Viewport bounding box filter: "minLat,minLng,maxLat,maxLng"
    if (bounds && typeof bounds === 'string') {
      const parts = bounds.split(',').map((p) => parseFloat(p.trim()));
      if (parts.length === 4 && parts.every((num) => !isNaN(num))) {
        const [minLat, minLng, maxLat, maxLng] = parts;
        where.centroidLat = { gte: minLat, lte: maxLat };
        where.centroidLng = { gte: minLng, lte: maxLng };
      }
    }

    const clusters = await prisma.issueCluster.findMany({
      where,
      orderBy: [{ priorityScore: 'desc' }, { reportCount: 'desc' }],
      include: {
        _count: {
          select: {
            memberships: true,
            upvoteRecords: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      count: clusters.length,
      data: { clusters },
    });
  } catch (error) {
    console.error('[Cluster:GetClusters] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve clusters',
    });
  }
}

/**
 * Check for an existing cluster nearby during citizen form filling to suggest upvote
 * GET /api/clusters/nearby?lat=...&lng=...&category=...
 */
export async function getNearbyCluster(req: Request, res: Response): Promise<void> {
  try {
    const latParam = req.query.lat || req.query.latitude;
    const lngParam = req.query.lng || req.query.longitude;
    const { category } = req.query;

    if (!latParam || !lngParam || !category) {
      res.status(400).json({
        success: false,
        message: 'lat/latitude, lng/longitude, and category are required parameters',
      });
      return;
    }

    const latitude = parseFloat(latParam as string);
    const longitude = parseFloat(lngParam as string);

    if (isNaN(latitude) || isNaN(longitude)) {
      res.status(400).json({ success: false, message: 'Invalid latitude or longitude' });
      return;
    }

    const match = await findNearbyClusterCandidate(
      { latitude, longitude },
      category as IssueCategory,
      DEFAULT_CLUSTER_DISTANCE_THRESHOLD_METERS
    );

    if (!match) {
      res.status(200).json({
        success: true,
        data: {
          hasNearbyCluster: false,
          cluster: null,
          distanceMeters: null,
        },
      });
      return;
    }

    // Retrieve recent complaint photos from the cluster
    const recentMembers = await prisma.clusterMembership.findMany({
      where: { clusterId: match.cluster.id },
      take: 3,
      orderBy: { joinedAt: 'desc' },
      include: {
        complaint: {
          select: {
            description: true,
            imageUrl: true,
            createdAt: true,
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      data: {
        hasNearbyCluster: true,
        cluster: match.cluster,
        distanceMeters: match.distance,
        recentComplaints: recentMembers.map((m) => m.complaint),
      },
    });
  } catch (error) {
    console.error('[Cluster:GetNearby] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to search for nearby clusters',
    });
  }
}

/**
 * Top prioritized issues for municipal authorities
 * GET /api/clusters/top?limit=20&status=OPEN
 */
export async function getTopClusters(req: Request, res: Response): Promise<void> {
  try {
    const { limit = 20, status = 'OPEN', category } = req.query;

    const take = Math.min(Math.max(parseInt(limit as string, 10) || 20, 1), 100);

    const where: any = {};
    if (status && status !== 'ALL') {
      where.status = status as ClusterStatus;
    }
    if (category) {
      where.category = category as IssueCategory;
    }

    const topClusters = await prisma.issueCluster.findMany({
      where,
      take,
      orderBy: [{ priorityScore: 'desc' }, { reportCount: 'desc' }],
      include: {
        memberships: {
          take: 5,
          orderBy: { joinedAt: 'desc' },
          include: {
            complaint: {
              select: {
                id: true,
                description: true,
                imageUrl: true,
                createdAt: true,
                user: {
                  select: { name: true },
                },
              },
            },
          },
        },
      },
    });

    res.status(200).json({
      success: true,
      count: topClusters.length,
      data: { topClusters },
    });
  } catch (error) {
    console.error('[Cluster:GetTop] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve top priority clusters',
    });
  }
}

/**
 * Get detailed cluster information including all constituent complaints
 * GET /api/clusters/:id
 */
export async function getClusterById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const cluster = await prisma.issueCluster.findUnique({
      where: { id },
      include: {
        memberships: {
          orderBy: { joinedAt: 'desc' },
          include: {
            complaint: {
              include: {
                user: {
                  select: { id: true, name: true },
                },
              },
            },
          },
        },
        _count: {
          select: { upvoteRecords: true },
        },
      },
    });

    if (!cluster) {
      res.status(404).json({ success: false, message: 'Issue cluster not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: { cluster },
    });
  } catch (error) {
    console.error('[Cluster:GetById] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve cluster details',
    });
  }
}

/**
 * Citizen upvoting an existing cluster to prevent duplicate submissions
 * POST /api/clusters/:id/upvote
 */
export async function upvoteCluster(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const { id: clusterId } = req.params;

    // Check cluster existence
    const cluster = await prisma.issueCluster.findUnique({
      where: { id: clusterId },
    });

    if (!cluster) {
      res.status(404).json({ success: false, message: 'Issue cluster not found' });
      return;
    }

    if (cluster.status === 'RESOLVED') {
      res.status(400).json({
        success: false,
        message: 'Cannot upvote a resolved cluster',
      });
      return;
    }

    // Check if user already upvoted
    const existingUpvote = await prisma.upvote.findUnique({
      where: {
        userId_clusterId: {
          userId,
          clusterId,
        },
      },
    });

    if (existingUpvote) {
      res.status(409).json({
        success: false,
        message: 'You have already upvoted this civic issue cluster',
      });
      return;
    }

    // Atomic transaction: Create upvote and update cluster metrics
    const updatedCluster = await prisma.$transaction(async (tx) => {
      await tx.upvote.create({
        data: {
          userId,
          clusterId,
        },
      });

      const nextUpvotes = cluster.upvotes + 1;
      const nextPriorityScore = calculatePriorityScore(
        cluster.reportCount,
        nextUpvotes,
        cluster.category
      );

      return await tx.issueCluster.update({
        where: { id: clusterId },
        data: {
          upvotes: nextUpvotes,
          priorityScore: nextPriorityScore,
          updatedAt: new Date(),
        },
      });
    });

    res.status(200).json({
      success: true,
      message: 'Upvote recorded successfully. Issue priority elevated.',
      data: { cluster: updatedCluster },
    });
  } catch (error) {
    console.error('[Cluster:Upvote] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to record upvote',
    });
  }
}

/**
 * Update cluster workflow status (Authority only)
 * PATCH /api/clusters/:id/status
 */
export async function updateClusterStatus(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status || !['OPEN', 'IN_PROGRESS', 'RESOLVED'].includes(status)) {
      res.status(400).json({
        success: false,
        message: 'Status must be one of: OPEN, IN_PROGRESS, RESOLVED',
      });
      return;
    }

    const cluster = await prisma.issueCluster.findUnique({
      where: { id },
    });

    if (!cluster) {
      res.status(404).json({ success: false, message: 'Issue cluster not found' });
      return;
    }

    const updatedCluster = await prisma.issueCluster.update({
      where: { id },
      data: {
        status: status as ClusterStatus,
        updatedAt: new Date(),
      },
    });

    res.status(200).json({
      success: true,
      message: `Cluster status transitioned to ${status}`,
      data: { cluster: updatedCluster },
    });
  } catch (error) {
    console.error('[Cluster:UpdateStatus] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update cluster status',
    });
  }
}
