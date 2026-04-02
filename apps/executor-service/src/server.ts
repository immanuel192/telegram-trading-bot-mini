/**
 * Purpose: Server wiring and initialization.
 * Wires up server instances, starts dependency services, and manages lifecycle.
 * This is where we orchestrate the executor-service with all its dependencies.
 */

import { close as closeDb, init as initDb } from '@dal';

import { config } from './config';
import { createContainer } from './container';
import { Container } from './interfaces';
import { logger } from './logger';
import {
  createConsumers,
  startConsumers,
  stopConsumers,
  ConsumerRegistry,
} from './events';

export interface ServerContext {
  container: Container;
  consumers: ConsumerRegistry;
}

/**
 * Initialize and start the server with all dependencies
 */
export async function startServer(): Promise<ServerContext> {
  logger.info('Starting executor-service...');

  // 1. Connect to Database
  await initDb(config, logger);
  logger.info('Database connected');

  // 2. Create container with service instances
  const container = await createContainer();

  // 3. Pre-load all broker adapters for active accounts
  //    This also registers tokens with TokenManager
  logger.info('Pre-loading broker adapters...');
  await container.brokerFactory.preloadAdapters();
  logger.info('Broker adapters pre-loaded successfully');

  // 4. Create and start stream consumers
  const consumers = await createConsumers(logger);
  startConsumers(consumers, container, logger);

  // 5. Initialize and start job system
  logger.info('Initializing job system...');
  await container.jobManager.init();
  container.jobManager.start();
  logger.info('Job system started');

  logger.info('Executor-service started successfully');

  // Setup graceful shutdown
  setupGracefulShutdown({ container, consumers });

  return {
    container,
    consumers,
  };
}

/**
 * Gracefully stop the server and all services
 */
export async function stopServer(context: ServerContext): Promise<void> {
  logger.info('Shutting down server...');

  const { container, consumers } = context;

  // Stop stream consumers
  await stopConsumers(consumers, logger);
  logger.info('Stream consumers stopped');

  // Close all broker adapters
  await container.brokerFactory.closeAll();
  logger.info('Broker adapters closed');

  // Close stream publisher
  await container.streamPublisher.close();
  logger.info('Stream publisher closed');

  // Stop job system
  logger.info('Stopping job system...');
  container.jobManager.stop();
  await container.jobService.drainQueue();
  logger.info('Job system stopped');

  // Close database connection
  await closeDb();
  logger.info('Database connection closed');

  logger.info('Server shutdown complete');
}

/**
 * Setup graceful shutdown handlers
 */
function setupGracefulShutdown(context: ServerContext): void {
  const shutdown = async (signal: string) => {
    logger.info({ signal }, 'Received shutdown signal');

    try {
      await stopServer(context);
      process.exit(0);
    } catch (error) {
      logger.error({ error }, 'Error during shutdown');
      process.exit(1);
    }
  };

  // Handle termination signals
  ['SIGTERM', 'SIGINT'].forEach((signal) => {
    process.on(signal, () => shutdown(signal));
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error({ error }, 'Uncaught exception');
    shutdown('uncaughtException');
  });

  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled rejection');
    shutdown('unhandledRejection');
  });
}
