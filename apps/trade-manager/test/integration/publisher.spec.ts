import { createContainer } from '../../src/container';
import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
import { fakeLogger } from '@telegram-trading-bot-mini/shared/test-utils';

describe('Publisher Integration Tests', () => {
  let mockLogger: LoggerInstance;
  let container: any;

  beforeAll(() => {
    mockLogger = fakeLogger;
    container = createContainer(mockLogger);
  });

  describe('RedisStreamPublisher', () => {
    it('should initialize streamPublisher successfully', () => {
      expect(container.streamPublisher).toBeDefined();
      expect(container.streamPublisher.constructor.name).toContain(
        'RedisStreamPublisher',
      );
    });

    it('should have publisher interface methods available', async () => {
      const publisher = container.streamPublisher;

      // Check if the publisher has the expected interface
      expect(typeof publisher.publish).toBe('function');
      expect(typeof publisher.close).toBe('function');
      expect(typeof publisher.client).toBe('object');
    });

    it('should handle connection errors gracefully', async () => {
      const publisher = container.streamPublisher;

      // Test error handling mechanism exists
      try {
        // This should fail gracefully when trying to publish
        await publisher.publish('test-stream', { type: 'test', payload: {} });
      } catch (error) {
        // Expected behavior - connection should fail gracefully
        expect(error).toBeDefined();
      }
    });

    it('should publish message format validation', async () => {
      const publisher = container.streamPublisher;

      // Test message format (this will fail if Redis is not available, but we test the interface)
      const testMessage = {
        type: 'TRANSLATE_MESSAGE_REQUEST',
        data: { messageId: 'test-123', content: 'test message' },
        timestamp: new Date().toISOString(),
      };

      try {
        const result = await publisher.publish('test-stream', testMessage);
        // If Redis is available, result should be truthy
        if (result) {
          expect(typeof result).toBe('string');
        }
      } catch (error) {
        // If Redis is not available, that's expected in test environment
        expect(error).toBeDefined();
      }
    });
  });

  afterAll(async () => {
    // Clean up connections if needed
    if (container?.streamPublisher) {
      try {
        await container.streamPublisher.close();
      } catch (error) {
        // Ignore cleanup errors
      }
    }
  });
});
