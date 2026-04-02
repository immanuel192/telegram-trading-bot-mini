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

export interface ServerContext {
  container: Container;
  httpServer: IHttpServer;
  httpApp: FastifyInstance;
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

  // 3. Create HTTP server with injected services
  const httpServer = new HttpServer(container.telegramService);
  const httpApp = httpServer.getApp();

  // 4. Start services
  await container.telegramService.connect();
  logger.info('Telegram service connected');

  return {
    container,
    httpServer,
    httpApp,
  };
}

/**
 * Gracefully stop the server and all services
 */
export async function stopServer(context: ServerContext): Promise<void> {
  logger.info('Shutting down server...');

  await context.httpServer.stop();
  logger.info('HTTP server stopped');

  await context.container.telegramService.disconnect();
  logger.info('Telegram service disconnected');

  await closeDb();
  logger.info('Database connection closed');
}
