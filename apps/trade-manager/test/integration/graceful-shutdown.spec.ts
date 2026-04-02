import {
  suiteName,
  setupDb,
  teardownDb,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { tradeManagerJobRepository, mongoDb } from '@dal';
import { ServerContext, startServer, stopServer } from '../../src/server';
import { Job } from '@telegram-trading-bot-mini/shared/utils';

describe(suiteName(__filename), () => {
  let serverContext: ServerContext | null = null;

  beforeAll(async () => {
    await setupDb();
  });

  afterAll(async () => {
    await teardownDb();
  });

  beforeEach(async () => {
    // Clean up before each test to avoid duplicate key errors
    await cleanupDb(mongoDb, [COLLECTIONS.JOBS_TRADE_MANAGER]);
  });

  afterEach(async () => {
    // Cleanup is handled in test itself usually, but safe guard here
    if (serverContext) {
      // We might have already stopped it in the test
      try {
        await stopServer(serverContext);
      } catch (e) {
        // Ignore if already stopped
      }
      serverContext = null;
    }
  });

  it('should drain job queue during shutdown', async () => {
    // 1. Insert a sample job
    const jobConfig: Job = {
      jobId: 'sample-job',
      name: 'shutdown-test-job',
      isActive: true,
      config: {
        cronExpression: '* * * * *',
      },
    } as Job;

    await tradeManagerJobRepository.create(jobConfig);

    // 2. Start server
    serverContext = await startServer();
    const { jobService } = serverContext.container;

    // 3. Queue a job trigger
    // We mock the worker to be slow to ensure it's still running when we call stop
    // But fastq worker is bound in constructor. We can't easily replace it.
    // Instead, we just spy on drainQueue.
    const drainSpy = jest.spyOn(jobService, 'drainQueue');

    await jobService.triggerJob({ jobName: 'shutdown-test-job' });

    // 4. Stop server
    await stopServer(serverContext);
    serverContext = null; // Mark as stopped

    // 5. Verify drainQueue was called
    expect(drainSpy).toHaveBeenCalled();
  }, 30000);
});
