/**
 * Unit tests for BaseJob class
 */

import { Job, BaseJob } from '../../../src/jobs';
import { fakeLogger } from '@telegram-trading-bot-mini/shared/test-utils';

// Mock cron
jest.mock('cron', () => ({
  CronJob: jest.fn().mockImplementation(() => ({
    start: jest.fn(),
    stop: jest.fn(),
    nextDate: jest
      .fn()
      .mockReturnValue({ toISO: () => '2026-01-06T10:00:00Z' }),
  })),
}));

// Concrete implementation for testing abstract class
class TestJob extends BaseJob<any, any> {
  public onTickMock = jest.fn();

  protected async onTick(params?: any, traceToken?: string): Promise<void> {
    await this.onTickMock(params, traceToken);
  }
}

describe('BaseJob', () => {
  let job: TestJob;
  let jobConfig: Job;
  let mockContainer: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContainer = {
      logger: fakeLogger,
      someService: { doSomething: jest.fn() },
    };

    jobConfig = {
      jobId: 'test-job',
      name: 'test-job-instance',
      isActive: true,
      config: {
        cronExpression: '*/5 * * * *',
        timezone: 'UTC',
      },
    } as Job;

    job = new TestJob(jobConfig, fakeLogger, mockContainer);
  });

  describe('constructor', () => {
    it('should initialize with job config, logger, and container', () => {
      expect(job.getConfig()).toEqual(jobConfig);
      expect(job['logger']).toBe(fakeLogger);
      expect(job['container']).toBe(mockContainer);
    });
  });

  describe('init', () => {
    it('should initialize cron job if expression is provided', async () => {
      await job.init();

      expect(fakeLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'test-job' }),
        'Initializing job',
      );
      expect(job['cronJob']).not.toBeNull();
    });

    it('should use default UTC timezone if not specified', async () => {
      jobConfig.config.timezone = undefined;
      job = new TestJob(jobConfig, fakeLogger, mockContainer);

      await job.init();

      const { CronJob } = require('cron');
      expect(CronJob).toHaveBeenCalledWith(
        '*/5 * * * *',
        expect.any(Function),
        null,
        false,
        'UTC',
      );
    });

    it('should use specified timezone', async () => {
      jobConfig.config.timezone = 'America/New_York';
      job = new TestJob(jobConfig, fakeLogger, mockContainer);

      await job.init();

      const { CronJob } = require('cron');
      expect(CronJob).toHaveBeenCalledWith(
        '*/5 * * * *',
        expect.any(Function),
        null,
        false,
        'America/New_York',
      );
    });

    it('should not create cron job if expression is missing', async () => {
      jobConfig.config.cronExpression = '';
      job = new TestJob(jobConfig, fakeLogger, mockContainer);

      await job.init();

      expect(job['cronJob']).toBeNull();
    });
  });

  describe('start', () => {
    it('should start cron job if initialized', async () => {
      await job.init();
      const cronJob = job['cronJob'];

      job.start();

      expect(cronJob?.start).toHaveBeenCalled();
      expect(fakeLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'test-job',
          jobName: 'test-job-instance',
          nextRun: '2026-01-06T10:00:00Z',
        }),
        'Job started',
      );
    });

    it('should warn if starting without init', () => {
      job.start();

      expect(fakeLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'test-job',
          jobName: 'test-job-instance',
        }),
        'Cannot start job: No cron job initialized',
      );
    });
  });

  describe('stop', () => {
    it('should stop cron job if initialized', async () => {
      await job.init();
      const cronJob = job['cronJob'];

      job.stop();

      expect(cronJob?.stop).toHaveBeenCalled();
      expect(fakeLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'test-job',
          jobName: 'test-job-instance',
        }),
        'Job stopped',
      );
    });

    it('should do nothing if cron job is not initialized', () => {
      job.stop();

      // Should not throw or log
      expect(fakeLogger.info).not.toHaveBeenCalled();
    });
  });

  describe('trigger', () => {
    it('should execute job logic manually', async () => {
      await job.trigger();

      expect(fakeLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'test-job',
          jobName: 'test-job-instance',
        }),
        'Job manually triggered',
      );
      expect(job.onTickMock).toHaveBeenCalled();
    });

    it('should execute job logic with params', async () => {
      const params = { orderId: 'test-123', action: 'process' };

      await job.trigger({ params });

      expect(fakeLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'test-job',
          jobName: 'test-job-instance',
          params,
        }),
        'Job manually triggered',
      );
      expect(job.onTickMock).toHaveBeenCalledWith(params, undefined);
    });

    it('should execute job logic with traceToken', async () => {
      const traceToken = 'trace-abc-123';

      await job.trigger({ traceToken });

      expect(fakeLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'test-job',
          jobName: 'test-job-instance',
          traceToken,
        }),
        'Job manually triggered',
      );
      expect(job.onTickMock).toHaveBeenCalledWith(undefined, traceToken);
    });

    it('should execute job logic with both params and traceToken', async () => {
      const params = { orderId: 'test-123' };
      const traceToken = 'trace-abc-123';

      await job.trigger({ params, traceToken });

      expect(job.onTickMock).toHaveBeenCalledWith(params, traceToken);
    });
  });

  describe('execute', () => {
    it('should call onTick and onComplete in sequence', async () => {
      const onCompleteSpy = jest.spyOn(job as any, 'onComplete');

      await job.trigger();

      expect(job.onTickMock).toHaveBeenCalled();
      expect(onCompleteSpy).toHaveBeenCalled();
      expect(fakeLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'test-job',
          jobName: 'test-job-instance',
        }),
        'Executing job logic',
      );
    });

    it('should handle errors during execution without throwing', async () => {
      const error = new Error('Test error');
      job.onTickMock.mockRejectedValue(error);

      // Should not throw
      await expect(job.trigger()).resolves.not.toThrow();

      expect(fakeLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'test-job',
          jobName: 'test-job-instance',
          error,
        }),
        'Job execution failed',
      );
    });

    it('should not call onComplete if onTick fails', async () => {
      const onCompleteSpy = jest.spyOn(job as any, 'onComplete');
      job.onTickMock.mockRejectedValue(new Error('Test error'));

      await job.trigger();

      expect(job.onTickMock).toHaveBeenCalled();
      expect(onCompleteSpy).not.toHaveBeenCalled();
    });

    it('should pass params and traceToken to onTick', async () => {
      const params = { key: 'value' };
      const traceToken = 'trace-123';

      await job.trigger({ params, traceToken });

      expect(fakeLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          params,
          traceToken,
        }),
        'Executing job logic',
      );
    });
  });

  describe('onComplete', () => {
    it('should log completion message', async () => {
      await job.trigger();

      expect(fakeLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'test-job',
          jobName: 'test-job-instance',
        }),
        'Job execution completed',
      );
    });
  });

  describe('getConfig', () => {
    it('should return the job configuration', () => {
      const config = job.getConfig();

      expect(config).toEqual(jobConfig);
      expect(config.jobId).toBe('test-job');
      expect(config.name).toBe('test-job-instance');
    });
  });

  describe('container access', () => {
    it('should allow access to container services in onTick', async () => {
      class ContainerTestJob extends BaseJob<typeof mockContainer, any> {
        protected async onTick(): Promise<void> {
          await this.container.someService.doSomething();
        }
      }

      const containerJob = new ContainerTestJob(
        jobConfig,
        fakeLogger,
        mockContainer,
      );

      await containerJob.trigger();

      expect(mockContainer.someService.doSomething).toHaveBeenCalled();
    });
  });

  describe('generic type parameters', () => {
    it('should support typed parameters', async () => {
      interface TestParams {
        orderId: string;
        amount: number;
      }

      class TypedJob extends BaseJob<any, TestParams> {
        public receivedParams?: TestParams;

        protected async onTick(params?: TestParams): Promise<void> {
          this.receivedParams = params;
        }
      }

      const typedJob = new TypedJob(jobConfig, fakeLogger, mockContainer);
      const params: TestParams = { orderId: 'order-123', amount: 100 };

      await typedJob.trigger({ params });

      expect(typedJob.receivedParams).toEqual(params);
    });
  });
});
