/**
 * Purpose: Main entry point for executor-service.
 * Minimal orchestration - delegates to server.ts for actual wiring.
 */

// Initialize Sentry FIRST before any other imports
import { initSentry } from './sentry';
initSentry();

import { logger } from './logger';
import { startServer, stopServer } from './server';

async function main() {
  try {
    // Start server with all dependencies
    const serverContext = await startServer();
    logger.info('executor-service started successfully');

    // Setup graceful shutdown handlers
    const shutdown = async () => {
      await stopServer(serverContext);
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (err) {
    logger.error(err, 'Failed to start application');
    process.exit(1);
  }
}

main();
