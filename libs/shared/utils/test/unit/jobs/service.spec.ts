/**
 * Unit tests for JobService
 */

import { JobService } from '../../../src/jobs/service';
import { JobManager } from '../../../src/jobs/manager';
import { BaseJob } from '../../../src/jobs/base';
import { fakeLogger } from '@telegram-trading-bot-mini/shared/test-utils';
import * as Sentry from '@sentry/node';

// Mock Sentry
jest.mock('@sentry/node', () => ({
  captureException: jest.fn(),
}));

// Mock fastq
jest.mock('fastq', () => {
  const actualFastq = jest.requireActual('fastq');
  return {
    ...actualFastq,
    promise: jest.fn((worker: any, concurrency: number) => {
      // Create a simple queue that executes immediately
      return {
        push: async (task: any) => {
          await worker(task);
        },
        idle: jest.fn(() => true),
        drain: jest.fn(async () => {}),
      };
    }),
  };
});

describe('JobService', () => {
  let jobService: JobService<any>;
  let mockJobManager: jest.Mocked<JobManager<any>>;
  let mockJob: jest.Mocked<BaseJob<any, any>>;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    mockJob = {
      trigger: jest.fn().mockResolvedValue(undefined),
      getConfig: jest.fn(),
      init: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
    } as any;

    mockJobManager = {
      getJobByName: jest.fn(),
      init: jest.fn(),
      start: jest.fn(),
      stop: jest.fn(),
      getAllJobs: jest.fn(),
    } as any;

    jobService = new JobService(mockJobManager, fakeLogger);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with job manager and logger', () => {
      expect(jobService).toBeInstanceOf(JobService);
      expect(jobService['jobManager']).toBe(mockJobManager);
      expect(jobService['logger']).toBe(fakeLogger);
    });

    it('should initialize queue with concurrency 1', () => {
      const fastq = require('fastq');
      expect(fastq.promise).toHaveBeenCalledWith(expect.any(Function), 1);
    });
  });

  describe('triggerJob', () => {
    beforeEach(() => {
      mockJobManager.getJobByName.mockReturnValue(mockJob);
    });

    it('should trigger job by name', async () => {
      await jobService.triggerJob({ jobName: 'test-job' });

      expect(fakeLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          jobName: 'test-job',
        }),
        'Queueing manual job trigger',
      );
      expect(mockJobManager.getJobByName).toHaveBeenCalledWith('test-job');
      expect(mockJob.trigger).toHaveBeenCalledWith({
        params: undefined,
        traceToken: undefined,
      });
    });

    it('should trigger job with params', async () => {
      const params = { orderId: 'order-123', action: 'process' };

      await jobService.triggerJob({
        jobName: 'test-job',
        params,
      });

      expect(fakeLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          jobName: 'test-job',
          params,
        }),
        'Queueing manual job trigger',
      );
      expect(mockJob.trigger).toHaveBeenCalledWith({
        params,
        traceToken: undefined,
      });
    });

    it('should trigger job with traceToken', async () => {
      const traceToken = 'trace-abc-123';

      await jobService.triggerJob({
        jobName: 'test-job',
        traceToken,
      });

      expect(mockJob.trigger).toHaveBeenCalledWith({
        params: undefined,
        traceToken,
      });
    });

    it('should trigger job with both params and traceToken', async () => {
      const params = { key: 'value' };
      const traceToken = 'trace-123';

      await jobService.triggerJob({
        jobName: 'test-job',
        params,
        traceToken,
      });

      expect(mockJob.trigger).toHaveBeenCalledWith({
        params,
        traceToken,
      });
    });

    it('should skip trigger if job not found', async () => {
      mockJobManager.getJobByName.mockReturnValue(undefined);

      await jobService.triggerJob({ jobName: 'non-existent-job' });

      expect(fakeLogger.warn).toHaveBeenCalledWith(
        { jobName: 'non-existent-job' },
        'Job not found, skipping trigger',
      );
      expect(mockJob.trigger).not.toHaveBeenCalled();
    });

    it('should handle job execution errors', async () => {
      const error = new Error('Job execution failed');
      mockJob.trigger.mockRejectedValue(error);

      await jobService.triggerJob({ jobName: 'test-job' });

      expect(fakeLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          jobName: 'test-job',
          error,
        }),
        'Failed to execute triggered job',
      );
      expect(Sentry.captureException).toHaveBeenCalledWith(error, {
        extra: {
          jobName: 'test-job',
          params: undefined,
          traceToken: undefined,
        },
      });
    });

    it('should include params and traceToken in Sentry context on error', async () => {
      const error = new Error('Job failed');
      const params = { orderId: 'order-123' };
      const traceToken = 'trace-abc';

      mockJob.trigger.mockRejectedValue(error);

      await jobService.triggerJob({
        jobName: 'test-job',
        params,
        traceToken,
      });

      expect(Sentry.captureException).toHaveBeenCalledWith(error, {
        extra: {
          jobName: 'test-job',
          params,
          traceToken,
        },
      });
    });
  });

  describe('triggerJob with delay', () => {
    beforeEach(() => {
      mockJobManager.getJobByName.mockReturnValue(mockJob);
    });

    it('should schedule job execution with delay', async () => {
      const delay = 5000; // 5 seconds

      await jobService.triggerJob({
        jobName: 'test-job',
        delay,
      });

      expect(fakeLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          jobName: 'test-job',
          delay,
        }),
        'Scheduling job execution with delay',
      );

      // Job should not be triggered immediately
      expect(mockJob.trigger).not.toHaveBeenCalled();

      // Fast-forward time
      jest.advanceTimersByTime(delay);

      // Wait for async operations
      await Promise.resolve();

      // Job should now be triggered
      expect(mockJob.trigger).toHaveBeenCalled();
    });

    it('should execute immediately if delay is 0', async () => {
      await jobService.triggerJob({
        jobName: 'test-job',
        delay: 0,
      });

      expect(mockJob.trigger).toHaveBeenCalled();
      expect(fakeLogger.debug).not.toHaveBeenCalledWith(
        expect.objectContaining({
          delay: 0,
        }),
        'Scheduling job execution with delay',
      );
    });

    it('should execute immediately if delay is undefined', async () => {
      await jobService.triggerJob({
        jobName: 'test-job',
      });

      expect(mockJob.trigger).toHaveBeenCalled();
    });

    it('should handle errors in delayed execution', async () => {
      const error = new Error('Delayed execution failed');
      mockJob.trigger.mockRejectedValue(error);

      const delay = 1000;

      await jobService.triggerJob({
        jobName: 'test-job',
        delay,
      });

      // Fast-forward time
      jest.advanceTimersByTime(delay);

      // Wait for async operations
      await Promise.resolve();

      expect(fakeLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          jobName: 'test-job',
          error,
        }),
        'Failed to execute triggered job',
      );
    });

    it('should log unexpected errors in delayed execution', async () => {
      const error = new Error('Unexpected error');
      mockJob.trigger.mockRejectedValue(error);

      const delay = 1000;

      await jobService.triggerJob({
        jobName: 'test-job',
        delay,
      });

      // Fast-forward time
      jest.advanceTimersByTime(delay);

      // Wait for async operations
      await Promise.resolve();

      // The error should be logged
      expect(fakeLogger.error).toHaveBeenCalled();
    });
  });

  describe('drainQueue', () => {
    it('should drain the queue', async () => {
      const queue = jobService['queue'];
      jest.spyOn(queue, 'idle').mockReturnValue(false);
      jest.spyOn(queue, 'drain').mockResolvedValue(undefined);

      await jobService.drainQueue();

      expect(fakeLogger.info).toHaveBeenCalledWith(
        'Draining job trigger queue...',
      );
      expect(queue.drain).toHaveBeenCalled();
      expect(fakeLogger.info).toHaveBeenCalledWith('Job trigger queue drained');
    });

    it('should return immediately if queue is idle', async () => {
      const queue = jobService['queue'];
      jest.spyOn(queue, 'idle').mockReturnValue(true);
      jest.spyOn(queue, 'drain').mockResolvedValue(undefined);

      await jobService.drainQueue();

      expect(queue.drain).not.toHaveBeenCalled();
      expect(fakeLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('worker function', () => {
    beforeEach(() => {
      mockJobManager.getJobByName.mockReturnValue(mockJob);
    });

    it('should log processing of manual trigger task', async () => {
      const params = { key: 'value' };
      const traceToken = 'trace-123';

      await jobService.triggerJob({
        jobName: 'test-job',
        params,
        traceToken,
      });

      expect(fakeLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          jobName: 'test-job',
          params,
          traceToken,
        }),
        'Processing manual trigger task',
      );
    });
  });

  describe('Generic type support', () => {
    it('should support typed params', async () => {
      interface TestParams {
        orderId: string;
        amount: number;
      }

      mockJobManager.getJobByName.mockReturnValue(mockJob);

      const params: TestParams = {
        orderId: 'order-123',
        amount: 100,
      };

      await jobService.triggerJob<TestParams>({
        jobName: 'test-job',
        params,
      });

      expect(mockJob.trigger).toHaveBeenCalledWith({
        params,
        traceToken: undefined,
      });
    });
  });

  describe('Edge cases', () => {
    it('should handle empty job name', async () => {
      mockJobManager.getJobByName.mockReturnValue(undefined);

      await jobService.triggerJob({ jobName: '' });

      expect(fakeLogger.warn).toHaveBeenCalledWith(
        { jobName: '' },
        'Job not found, skipping trigger',
      );
    });

    it('should handle very long delay', async () => {
      mockJobManager.getJobByName.mockReturnValue(mockJob);

      const delay = 2147483647; // Max 32-bit integer

      await jobService.triggerJob({
        jobName: 'test-job',
        delay,
      });

      expect(fakeLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ delay }),
        'Scheduling job execution with delay',
      );
    });

    it('should handle negative delay as immediate execution', async () => {
      mockJobManager.getJobByName.mockReturnValue(mockJob);

      await jobService.triggerJob({
        jobName: 'test-job',
        delay: -1000,
      });

      // Negative delay should be treated as immediate
      expect(mockJob.trigger).toHaveBeenCalled();
    });

    it('should handle null params', async () => {
      mockJobManager.getJobByName.mockReturnValue(mockJob);

      await jobService.triggerJob({
        jobName: 'test-job',
        params: null as any,
      });

      expect(mockJob.trigger).toHaveBeenCalledWith({
        params: null,
        traceToken: undefined,
      });
    });
  });
});
