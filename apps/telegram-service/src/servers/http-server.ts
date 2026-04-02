/**
 * Purpose: HTTP web server class using Fastify.
 * Handles HTTP routes, middleware, and server lifecycle.
 */

import Fastify, { FastifyInstance } from 'fastify';

import { config } from '../config';
import { IHttpServer, ITelegramClientService } from '../interfaces';

export class HttpServer implements IHttpServer {
  private app: FastifyInstance;

  constructor(private readonly telegramService: ITelegramClientService) {
    this.app = Fastify({ logger: true });
    this.setupRoutes();
  }

  private setupRoutes() {
    this.app.get('/healthcheck', async () => {
      // In the future, we can check telegramService.getMe() or similar to verify connectivity
      return { status: 'ok', timestamp: new Date().toISOString() };
    });
  }

  async start(): Promise<void> {
    try {
      const port = config('PORT');
      await this.app.listen({ port, host: '0.0.0.0' });
      console.log(`Server listening on port ${port}`);
    } catch (err) {
      this.app.log.error(err);
      process.exit(1);
    }
  }

  getApp(): FastifyInstance {
    return this.app;
  }

  async stop(): Promise<void> {
    await this.app.close();
  }
}
