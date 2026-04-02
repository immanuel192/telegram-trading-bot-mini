/**
 * Integration test for interpret-service bootstrap
 * Tests the full application startup including:
 * - Database connection
 * - Service initialization
 * - HTTP server startup
 * - Stream consumers creation
 * - Healthcheck endpoint
 */

import { suiteName } from '@telegram-trading-bot-mini/shared/test-utils';

import { ServerContext } from '../../src/interfaces';
import { startServer, stopServer } from '../../src/server';

describe(suiteName(__filename), () => {
  let serverContext: ServerContext | null = null;

  afterEach(async () => {
    if (serverContext) {
      await stopServer(serverContext);
      serverContext = null;
    }
  });

  describe('Server Bootstrap', () => {
    it('should start and stop server successfully', async () => {
      // Start the server with all dependencies
      serverContext = await startServer();

      // Verify context is returned
      expect(serverContext).toBeDefined();
      expect(serverContext.container).toBeDefined();
      expect(serverContext.container.logger).toBeDefined();
      expect(serverContext.container.streamPublisher).toBeDefined();
      expect(serverContext.httpServer).toBeDefined();
      expect(serverContext.httpApp).toBeDefined();
      expect(serverContext.consumers).toBeDefined();

      // Should stop without errors
      await expect(stopServer(serverContext)).resolves.not.toThrow();
      serverContext = null; // Prevent double cleanup
    }, 30000);

    it('should create stream consumers', async () => {
      // Start server
      serverContext = await startServer();

      // Verify consumers registry is not empty
      expect(serverContext.consumers).toBeDefined();
      expect(serverContext.consumers.requestConsumer).toBeDefined();
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
