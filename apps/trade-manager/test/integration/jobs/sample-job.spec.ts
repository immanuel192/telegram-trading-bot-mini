import {
  suiteName,
  setupDb,
  teardownDb,
  cleanupDb,
  COLLECTIONS,
} from '@telegram-trading-bot-mini/shared/test-utils';
import { tradeManagerJobRepository, mongoDb } from '@dal';
import { Job } from '@telegram-trading-bot-mini/shared/utils';
import { SampleJob } from '../../../src/jobs/sample-job';
import { Container } from '../../../src/interfaces';
import { createContainer } from '../../../src/container';
import { logger } from '../../../src/logger';

describe(suiteName(__filename), () => {
  let container: Container;

  beforeAll(async () => {
    // Setup global DB connection for test setup
    await setupDb();
    container = createContainer(logger);
  });

  afterAll(async () => {
    await teardownDb();
  });

  beforeEach(async () => {
    // Clean up before each test to avoid duplicate key errors
    await cleanupDb(mongoDb, [COLLECTIONS.JOBS_TRADE_MANAGER]);
  });

  it('should load and initialize sample job from database', async () => {
    // 1. Insert a sample job into the database
    const jobConfig: Job = {
      jobId: 'sample-job',
      name: 'integration-test-job',
      isActive: true,
      config: {
        cronExpression: '* * * * *',
      },
      meta: { test: true },
    } as Job;

    await tradeManagerJobRepository.create(jobConfig);

    // force jobManager to reload
    await container.jobManager.init();

    // 3. Verify JobManager has loaded the job
    const loadedJob = container.jobManager.getJobByName('integration-test-job');

    expect(loadedJob).toBeDefined();
    expect(loadedJob).toBeInstanceOf(SampleJob);
    expect(loadedJob?.getConfig().jobId).toBe('sample-job');
    expect(loadedJob?.getConfig().meta).toEqual({ test: true });
  }, 30000);

  it('should not load inactive jobs', async () => {
    // 1. Insert an inactive job
    const jobConfig: Job = {
      jobId: 'sample-job',
      name: 'inactive-test-job',
      isActive: false,
      config: {
        cronExpression: '* * * * *',
      },
    } as Job;

    await tradeManagerJobRepository.create(jobConfig);

    // force jobManager to reload
    await container.jobManager.init();

    // 3. Verify JobManager has NOT loaded the job
    const loadedJob = container.jobManager.getJobByName('inactive-test-job');

    expect(loadedJob).toBeUndefined();
  }, 30000);
});
