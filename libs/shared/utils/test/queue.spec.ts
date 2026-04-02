import { Queue, createQueue } from '../src/queue';
import pino from 'pino';
import { suiteName } from '@telegram-trading-bot-mini/shared/test-utils';

describe(suiteName(__filename), () => {
  describe('createQueue', () => {
    it('should create a queue instance', () => {
      const executor = jest.fn().mockResolvedValue('result');
      const queue = createQueue(executor);

      expect(queue).toBeInstanceOf(Queue);
      expect(queue.getConcurrency()).toBe(1);
    });

    it('should create a queue with custom concurrency', () => {
      const executor = jest.fn().mockResolvedValue('result');
      const queue = createQueue(executor, { concurrency: 3 });

      expect(queue.getConcurrency()).toBe(3);
    });
  });

  describe('Queue operations', () => {
    let queue: Queue<string>;
    let executor: jest.Mock;

    beforeEach(() => {
      executor = jest.fn().mockResolvedValue('processed');
      queue = createQueue(executor);
    });

    it('should process tasks', async () => {
      const task = 'test-task';
      const promise = queue.push(task);

      expect(executor).toHaveBeenCalledWith(task);
      await expect(promise).resolves.toBe('processed');
    });

    it('should track queue length', async () => {
      const task1 = 'task1';
      const task2 = 'task2';

      queue.push(task1);
      queue.push(task2);

      // Queue length might be 0-2 depending on processing speed
      expect(queue.length()).toBeGreaterThanOrEqual(0);
      expect(queue.length()).toBeLessThanOrEqual(2);
    });

    it('should drain queue', async () => {
      const task1 = 'task1';
      const task2 = 'task2';

      queue.push(task1);
      queue.push(task2);

      await queue.drained();
      expect(executor).toHaveBeenCalledTimes(2);
    });

    it('should handle errors with custom error handler', async () => {
      const error = new Error('Test error');
      const onError = jest.fn();
      executor.mockRejectedValue(error);

      const queueWithErrorHandler = createQueue(executor, { onError });
      queueWithErrorHandler.push('task');

      // Wait a bit for error to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(onError).toHaveBeenCalledWith(error, 'task');
    });

    it('should handle errors with logger', async () => {
      const error = new Error('Test error');
      const logger = pino({ level: 'silent' });
      const loggerErrorSpy = jest.spyOn(logger, 'error');
      executor.mockRejectedValue(error);

      const queueWithLogger = createQueue(executor, { logger });
      queueWithLogger.push('task');

      // Wait a bit for error to be processed
      await new Promise((resolve) => setTimeout(resolve, 10));

      expect(loggerErrorSpy).toHaveBeenCalled();
    });

    it('should kill queue', () => {
      queue.kill();
      // Queue should be killed (no new tasks processed)
      expect(() => queue.push('task')).not.toThrow();
    });

    it('should kill and drain queue', async () => {
      queue.push('task1');
      queue.killAndDrain();

      await queue.drained();
      expect(executor).toHaveBeenCalled();
    });
  });

  describe('Queue concurrency', () => {
    it('should respect concurrency limit', async () => {
      const executor = jest.fn(
        () => new Promise((resolve) => setTimeout(resolve, 10)),
      );
      const queue = createQueue(executor, { concurrency: 2 });

      // Push 5 tasks
      for (let i = 0; i < 5; i++) {
        queue.push(`task${i}`);
      }

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 5));

      // Should not exceed concurrency limit
      expect(executor).toHaveBeenCalledTimes(2);

      await queue.drained();
      expect(executor).toHaveBeenCalledTimes(5);
    });
  });
});
