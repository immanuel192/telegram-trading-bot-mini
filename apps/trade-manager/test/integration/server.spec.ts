/**
 * Integration test for trade-manager server bootstrap
 * Tests the full application startup including:
 * - Database connection
 * - Service initialization
 * - HTTP server startup
 * - Healthcheck endpoint
 */

import { suiteName } from '@telegram-trading-bot-mini/shared/test-utils';

import { ServerContext, startServer, stopServer } from '../../src/server';

describe(suiteName(__filename), () => {
  let serverContext: ServerContext | null = null;

  afterEach(async () => {
    if (serverContext) {
      await stopServer(serverContext);
      serverContext = null;
    }
  });

  describe('Server Bootstrap', () => {
    it('should bootstrap the application successfully', async () => {
      // Start the server with all dependencies
      serverContext = await startServer();

      // Verify all components are initialized
      expect(serverContext).toBeDefined();
      expect(serverContext.container).toBeDefined();
      expect(serverContext.container.logger).toBeDefined();
      expect(serverContext.container.accountRepository).toBeDefined();
      expect(serverContext.container.pushNotificationService).toBeDefined();
      expect(serverContext.httpServer).toBeDefined();
      expect(serverContext.httpApp).toBeDefined();
    }, 30000); // Increase timeout for DB connection

    it('should initialize repositories', async () => {
      serverContext = await startServer();

      // Verify repositories are initialized
      const { accountRepository } = serverContext.container;
      expect(accountRepository).toBeDefined();
      expect(accountRepository.findByAccountId).toBeDefined();
      expect(accountRepository.findAllActive).toBeDefined();
    }, 30000);
  });

  describe('HTTP Server', () => {
    beforeEach(async () => {
      serverContext = await startServer();
    }, 30000);

    it('should have a working healthcheck endpoint', async () => {
      const response = await serverContext!.httpApp.inject({
        method: 'GET',
        url: '/healthcheck',
      });

      expect(response.statusCode).toBe(200);

      const body = JSON.parse(response.body);
      expect(body).toMatchObject({
        status: 'ok',
      });
      expect(body.timestamp).toBeDefined();
      expect(new Date(body.timestamp).getTime()).toBeGreaterThan(0);
    });

    it('should return 404 for unknown routes', async () => {
      const response = await serverContext!.httpApp.inject({
        method: 'GET',
        url: '/unknown-route',
      });

      expect(response.statusCode).toBe(404);
    });
  });

  describe('Graceful Shutdown', () => {
    it('should shutdown gracefully', async () => {
      serverContext = await startServer();

      // Should not throw
      await expect(stopServer(serverContext)).resolves.not.toThrow();

      serverContext = null; // Prevent double cleanup
    }, 30000);
  });
});
