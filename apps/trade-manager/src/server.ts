/**
 * Purpose: Server wiring and initialization.
 * Wires up server instances, starts dependency services, and manages lifecycle.
 * This is where we orchestrate the HTTP server with all its dependencies.
 */

import { close as closeDb, init as initDb } from '@dal';
import { FastifyInstance } from 'fastify';

import { HttpServer } from './servers/http-server';
import { config } from './config';
import { createContainer } from './container';
import { Container, IHttpServer } from './interfaces';
import { logger } from './logger';
import { createConsumers, startConsumers, stopConsumers } from './events';
import { ConsumerRegistry } from './interfaces/consumer.interface';

export interface ServerContext {
  container: Container;
  httpServer: IHttpServer;
  httpApp: FastifyInstance;
  consumers: ConsumerRegistry;
}

/**
 * Initialize and start the server with all dependencies
 */
export async function startServer(): Promise<ServerContext> {
  // 1. Connect to Database
  await initDb(config, logger);
  logger.info('Database connected');

  // 2. Create container with service instances
  const container = createContainer(logger);

  // 3. Create HTTP server with injected logger
  const httpServer = new HttpServer(container.logger);
  const httpApp = httpServer.getApp();

  // 4. Start HTTP server
  await httpServer.start();

  // 5. Create and start stream consumers
  const consumers = await createConsumers(logger);
  startConsumers(consumers, container, logger);

  // 6. Initialize and start Job Manager
  await container.jobManager.init();
  container.jobManager.start();

  return {
    container,
    httpServer,
    httpApp,
    consumers,
  };
}

/**
 * Gracefully stop the server and all services
 */
export async function stopServer(context: ServerContext): Promise<void> {
  logger.info('Shutting down server...');

  // Stop job scheduler
  context.container.jobManager.stop();
  logger.info('Job scheduler stopped');

  // Drain job queue
  await context.container.jobService.drainQueue();
  logger.info('Job queue drained');

  // Stop stream consumers
  await stopConsumers(context.consumers, logger);
  logger.info('Stream consumers stopped');

  // Stop HTTP server
  await context.httpServer.stop();
  logger.info('HTTP server stopped');

  // Close database connection
  await closeDb();
  logger.info('Database connection closed');
}
