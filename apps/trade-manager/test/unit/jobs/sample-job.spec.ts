import { SampleJob } from '../../../src/jobs/sample-job';
import { Job } from '@telegram-trading-bot-mini/shared/utils';
import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
import { Container } from '../../../src/interfaces';
import { fakeLogger } from '@telegram-trading-bot-mini/shared/test-utils';

describe('SampleJob', () => {
  let job: SampleJob;
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
      jobId: 'sample-job',
      name: 'sample-job-instance',
      isActive: true,
      config: {
        cronExpression: '* * * * *',
      },
      meta: { foo: 'bar' },
    } as Job;

    job = new SampleJob(jobConfig, mockLogger, mockContainer);
  });

  it('should log message on tick', async () => {
    await job.trigger();

    expect(mockLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'sample-job',
        name: 'sample-job-instance',
        meta: { foo: 'bar' },
      }),
      'Sample job ticking...',
    );
  });
});
