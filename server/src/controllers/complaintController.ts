import { Request, Response } from 'express';
import { prisma } from '../config/db';
import { ingestAndClusterComplaint } from '../clustering/clusterService';
import { IssueCategory } from '@prisma/client';
import { SUPPORTED_CATEGORIES } from '../config/constants';

/**
 * Ingest a new complaint and cluster it in real-time
 * POST /api/complaints
 */
export async function createComplaint(req: Request, res: Response): Promise<void> {
  try {
    const userId = req.user?.id;
    if (!userId) {
      res.status(401).json({ success: false, message: 'Authentication required' });
      return;
    }

    const { category, description, imageUrl, latitude, longitude } = req.body;

    // Validation
    if (!category || !description || latitude === undefined || longitude === undefined) {
      res.status(400).json({
        success: false,
        message: 'Category, description, latitude, and longitude are required',
      });
      return;
    }

    if (!SUPPORTED_CATEGORIES.includes(category as IssueCategory)) {
      res.status(400).json({
        success: false,
        message: `Invalid category. Supported categories: ${SUPPORTED_CATEGORIES.join(', ')}`,
      });
      return;
    }

    const lat = parseFloat(latitude);
    const lng = parseFloat(longitude);

    if (isNaN(lat) || isNaN(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
      res.status(400).json({
        success: false,
        message: 'Valid GPS coordinates (latitude between -90 and 90, longitude between -180 and 180) are required',
      });
      return;
    }

    // Execute atomic clustering and complaint persistence
    const result = await ingestAndClusterComplaint({
      userId,
      category: category as IssueCategory,
      description: description.trim(),
      imageUrl: imageUrl ? imageUrl.trim() : null,
      latitude: lat,
      longitude: lng,
    });

    res.status(201).json({
      success: true,
      message: result.isNewCluster
        ? 'Complaint registered and new issue cluster initiated'
        : `Complaint merged into existing cluster (${result.distanceToCentroid}m from centroid)`,
      data: result,
    });
  } catch (error) {
    console.error('[Complaint:Create] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to ingest and cluster complaint',
    });
  }
}

/**
 * List complaints with optional category, user, or cluster filter
 * GET /api/complaints
 */
export async function getComplaints(req: Request, res: Response): Promise<void> {
  try {
    const { category, userId, clusterId, limit = 50, page = 1 } = req.query;

    const take = Math.min(Math.max(parseInt(limit as string, 10) || 50, 1), 100);
    const skip = (Math.max(parseInt(page as string, 10) || 1, 1) - 1) * take;

    const where: any = {};
    if (category) where.category = category as IssueCategory;
    if (userId) where.userId = userId as string;
    if (clusterId) {
      where.membership = { clusterId: clusterId as string };
    }

    const [complaints, total] = await Promise.all([
      prisma.complaint.findMany({
        where,
        take,
        skip,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, name: true },
          },
          membership: {
            select: {
              clusterId: true,
              distanceToCentroid: true,
              joinedAt: true,
            },
          },
        },
      }),
      prisma.complaint.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        complaints,
        pagination: {
          total,
          page: Math.floor(skip / take) + 1,
          limit: take,
          totalPages: Math.ceil(total / take),
        },
      },
    });
  } catch (error) {
    console.error('[Complaint:List] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve complaints',
    });
  }
}

/**
 * Get single complaint details
 * GET /api/complaints/:id
 */
export async function getComplaintById(req: Request, res: Response): Promise<void> {
  try {
    const { id } = req.params;

    const complaint = await prisma.complaint.findUnique({
      where: { id },
      include: {
        user: {
          select: { id: true, name: true },
        },
        membership: {
          include: {
            cluster: true,
          },
        },
      },
    });

    if (!complaint) {
      res.status(404).json({ success: false, message: 'Complaint not found' });
      return;
    }

    res.status(200).json({
      success: true,
      data: { complaint },
    });
  } catch (error) {
    console.error('[Complaint:GetById] Error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to retrieve complaint',
    });
  }
}
