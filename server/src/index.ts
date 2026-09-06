import dotenv from 'dotenv';
dotenv.config();

import app from './app';
import { connectDB, disconnectDB } from './config/db';

const PORT = process.env.PORT || 5000;

async function bootstrap() {
  try {
    await connectDB();

    const server = app.listen(PORT, () => {
      console.log(`====================================================`);
      console.log(`🚀 Nivara Civic Engine API listening on port ${PORT}`);
      console.log(`📡 Health Check: http://localhost:${PORT}/health`);
      console.log(`====================================================`);
    });

    const gracefulShutdown = async (signal: string) => {
      console.log(`\n[Server] Received ${signal}. Shutting down gracefully...`);
      server.close(async () => {
        await disconnectDB();
        console.log('[Server] Closed remaining connections. Exiting process.');
        process.exit(0);
      });
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  } catch (error) {
    console.error('[Bootstrap] Failed to start server:', error);
    process.exit(1);
  }
}

bootstrap();
