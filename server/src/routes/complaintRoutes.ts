import { Router } from 'express';
import {
  createComplaint,
  getComplaints,
  getComplaintById,
} from '../controllers/complaintController';
import { requireAuth } from '../middleware/authMiddleware';

const router = Router();

// Ingest new complaint with real-time clustering
router.post('/', requireAuth, createComplaint);

// List complaints
router.get('/', getComplaints);

// Get single complaint details
router.get('/:id', getComplaintById);

export default router;
