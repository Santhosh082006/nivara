import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../config/db';
import { Role } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  email: string;
  role: Role;
  name: string;
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}

interface JwtPayload {
  userId: string;
  email: string;
  role: Role;
  name: string;
}

export const requireAuth = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({
        success: false,
        message: 'Authentication token missing or invalid format',
      });
      return;
    }

    const token = authHeader.split(' ')[1];
    const jwtSecret = process.env.JWT_SECRET || 'nivara_civic_clustering_jwt_secret_key_2026_secure';

    const decoded = jwt.verify(token, jwtSecret) as JwtPayload;

    // Verify user still exists in database
    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: { id: true, email: true, role: true, name: true },
    });

    if (!user) {
      res.status(401).json({
        success: false,
        message: 'User account no longer exists',
      });
      return;
    }

    req.user = user;
    next();
  } catch (error) {
    res.status(401).json({
      success: false,
      message: 'Invalid or expired authentication token',
    });
  }
};

export const requireAuthority = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user || (req.user.role !== 'AUTHORITY' && req.user.role !== 'ADMIN')) {
    res.status(403).json({
      success: false,
      message: 'Access denied: Requires municipal authority or admin credentials',
    });
    return;
  }
  next();
};
