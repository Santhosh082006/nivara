import { Router } from 'express';
import {
  getClusters,
  getNearbyCluster,
  getTopClusters,
  getClusterById,
  upvoteCluster,
  updateClusterStatus,
} from '../controllers/clusterController';
import { requireAuth, requireAuthority } from '../middleware/authMiddleware';

const router = Router();

// Get clusters (supports bounds=minLat,minLng,maxLat,maxLng, category, status)
router.get('/', getClusters);

// Check for nearby matching cluster for deduplication suggestion
router.get('/nearby', getNearbyCluster);

// Get top priority clusters for municipal triage
router.get('/top', getTopClusters);

// Get specific cluster with its member complaints
router.get('/:id', getClusterById);

// Upvote an existing cluster (prevents duplicate submission)
router.post('/:id/upvote', requireAuth, upvoteCluster);

// Update cluster workflow status (requires authority credentials)
router.patch('/:id/status', requireAuth, requireAuthority, updateClusterStatus);

export default router;
