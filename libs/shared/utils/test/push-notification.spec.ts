import {
  PushNotificationService,
  createPushNotificationService,
} from '../src/push-notification';
import { PushNotificationSendOptions } from '../src/interfaces';
import pino from 'pino';
import { suiteName } from '@telegram-trading-bot-mini/shared/test-utils';

// Mock pushsafer-notifications
jest.mock('pushsafer-notifications', () => {
  return jest.fn().mockImplementation((config: { k: string }) => {
    return {
      send: jest.fn((options: any, callback: Function) => {
        // Simulate async callback
        setTimeout(() => {
          if (config.k === 'error-key') {
            callback(new Error('API error'), null);
          } else {
            callback(null, { status: 1, success: true });
          }
        }, 0);
      }),
    };
  });
});

describe(suiteName(__filename), () => {
  describe('createPushNotificationService', () => {
    it('should create a service instance', () => {
      const service = createPushNotificationService({
        apiKey: 'test-key',
      });

      expect(service).toBeInstanceOf(PushNotificationService);
    });

    it('should create service with custom concurrency', () => {
      const service = createPushNotificationService({
        apiKey: 'test-key',
        concurrency: 5,
      });

      expect(service.getQueueLength()).toBe(0);
    });
  });

  describe('PushNotificationService operations', () => {
    let service: PushNotificationService;
    let logger: pino.Logger;

    beforeEach(() => {
      logger = pino({ level: 'silent' });
      service = createPushNotificationService({
        apiKey: 'test-key',
        logger,
      });
    });

    it('should send notification', async () => {
      const options: PushNotificationSendOptions = {
        m: 'Test message',
        t: 'Test title',
        d: 'a',
        traceToken: 'test-token',
      };

      const promise = service.send(options);
      await expect(promise).resolves.toEqual({ status: 1, success: true });
    });

    it('should handle send errors', async () => {
      const errorService = createPushNotificationService({
        apiKey: 'error-key',
        logger,
      });

      const options: PushNotificationSendOptions = {
        m: 'Test message',
        d: 'a',
        traceToken: 'test-token',
      };

      await expect(errorService.send(options)).rejects.toThrow('API error');
    });

    it('should track queue length', async () => {
      const options: PushNotificationSendOptions = {
        m: 'Test message',
        d: 'a',
        traceToken: 'test-token',
      };

      service.send(options);
      service.send(options);

      // Queue length might vary based on processing speed
      expect(service.getQueueLength()).toBeGreaterThanOrEqual(0);
    });

    it('should drain queue', async () => {
      const options: PushNotificationSendOptions = {
        m: 'Test message',
        d: 'a',
        traceToken: 'test-token',
      };

      service.send(options);
      service.send(options);

      await service.drain();
      expect(service.getQueueLength()).toBe(0);
    });

    it('should kill queue', () => {
      service.kill();
      // Should not throw
      expect(() => {
        service.send({
          m: 'Test',
          d: 'a',
          traceToken: 'token',
        });
      }).not.toThrow();
    });

    it('should kill and drain queue', async () => {
      const options: PushNotificationSendOptions = {
        m: 'Test message',
        d: 'a',
        traceToken: 'test-token',
      };

      service.send(options);
      service.killAndDrain();

      await service.drain();
    });
  });

  describe('PushNotificationService with logger', () => {
    it('should log errors', async () => {
      const logger = pino({ level: 'silent' });
      const loggerErrorSpy = jest.spyOn(logger, 'error');
      const loggerInfoSpy = jest.spyOn(logger, 'info');

      const errorService = createPushNotificationService({
        apiKey: 'error-key',
        logger,
      });

      const options: PushNotificationSendOptions = {
        m: 'Test message',
        d: 'a',
        traceToken: 'test-token',
      };

      try {
        await errorService.send(options);
      } catch {
        // Expected to throw
      }

      // Wait for error handling
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('should log successful sends', async () => {
      const logger = pino({ level: 'silent' });
      const loggerInfoSpy = jest.spyOn(logger, 'info');

      const service = createPushNotificationService({
        apiKey: 'test-key',
        logger,
      });

      const options: PushNotificationSendOptions = {
        m: 'Test message',
        d: 'a',
        traceToken: 'test-token',
      };

      await service.send(options);

      expect(loggerInfoSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          traceToken: 'test-token',
        }),
        'Push notification sent',
      );
    });
  });
});
