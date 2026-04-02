import { BaseJob, Job } from '@telegram-trading-bot-mini/shared/utils';
import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
import { Container } from '../../../src/interfaces';
import { fakeLogger } from '@telegram-trading-bot-mini/shared/test-utils';

// Mock cron
jest.mock('cron', () => {
  return {
    CronJob: jest.fn().mockImplementation(() => ({
      start: jest.fn(),
      stop: jest.fn(),
      nextDate: jest.fn().mockReturnValue({ toISO: () => 'next-date' }),
    })),
  };
});

// Concrete implementation for testing abstract class
class TestJob extends BaseJob<Container> {
  public onTickMock = jest.fn();

  protected async onTick(params?: any, traceToken?: string): Promise<void> {
    await this.onTickMock(params, traceToken);
  }
}

describe('BaseJob', () => {
  let job: TestJob;
  let mockLogger: LoggerInstance;
  let mockContainer: Container;
  let jobConfig: Job;

  beforeEach(() => {
    mockLogger = fakeLogger;

    mockContainer = {
      logger: mockLogger,
      streamPublisher: {} as any,
      accountRepository: {} as any,
      jobRepository: {} as any,
      pushNotificationService: {} as any,
      jobManager: {} as any,
      jobService: {} as any,
      accountService: {} as any,
      telegramMessageRepository: {} as any,
      errorCapture: {} as any,
      orderRepository: {} as any,
      telegramChannelCacheService: {} as any,
      orderService: {} as any,
      commandTransformerService: {} as any,
      priceCacheService: {} as any,
      commandProcessingPipelineService: {} as any,
      orderCacheService: {} as any,
      redis: {} as any,
    };

    jobConfig = {
      jobId: 'test-job',
      name: 'test-job-instance',
      isActive: true,
      config: {
        cronExpression: '* * * * *',
      },
    } as Job;

    job = new TestJob(jobConfig, mockLogger, mockContainer);
  });

  describe('init', () => {
    it('should initialize cron job if expression is provided', async () => {
      await job.init();
      // We can't easily check private properties, but we can verify no error
      expect(mockLogger.debug).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'test-job' }),
        'Initializing job',
      );
    });
  });

  describe('start', () => {
    it('should start cron job if initialized', async () => {
      await job.init();
      job.start();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'test-job' }),
        'Job started',
      );
    });

    it('should warn if starting without init', () => {
      job.start();

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'test-job' }),
        'Cannot start job: No cron job initialized',
      );
    });
  });

  describe('stop', () => {
    it('should stop cron job if initialized', async () => {
      await job.init();
      job.stop();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'test-job' }),
        'Job stopped',
      );
    });
  });

  describe('trigger', () => {
    it('should execute job logic manually', async () => {
      await job.trigger();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'test-job' }),
        'Job manually triggered',
      );
      expect(job.onTickMock).toHaveBeenCalled();
    });

    it('should execute job logic with params and traceToken', async () => {
      const params = { orderId: 'test-123' };
      const traceToken = 'trace-abc';

      await job.trigger({ params, traceToken });

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'test-job',
          params,
          traceToken,
        }),
        'Job manually triggered',
      );
      expect(job.onTickMock).toHaveBeenCalledWith(params, traceToken);
    });
  });

  describe('execute', () => {
    it('should handle errors during execution', async () => {
      const error = new Error('Test error');
      job.onTickMock.mockRejectedValue(error);

      await job.trigger();

      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ jobId: 'test-job', error }),
        'Job execution failed',
      );
    });
  });
});
