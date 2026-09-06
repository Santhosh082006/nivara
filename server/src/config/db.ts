import { PrismaClient } from '@prisma/client';

declare global {
  // Prevent multiple instances of Prisma Client in development during hot-reloading
  var prismaGlobal: PrismaClient | undefined;
}

export const prisma =
  globalThis.prismaGlobal ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalThis.prismaGlobal = prisma;
}

export async function connectDB(): Promise<void> {
  try {
    await prisma.$connect();
    console.log('[Database] Successfully connected to PostgreSQL via Prisma');
  } catch (error) {
    console.error('[Database] Failed to connect to database:', error);
    throw error;
  }
}

export async function disconnectDB(): Promise<void> {
  await prisma.$disconnect();
}
