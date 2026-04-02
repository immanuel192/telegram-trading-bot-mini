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
import { JobRegistry } from '@telegram-trading-bot-mini/shared/utils';
import { Container } from '../../../src/interfaces';
import { createContainer } from '../../../src/container';
import { logger } from '../../../src/logger';

describe(suiteName(__filename), () => {
  let container: Container;

  beforeAll(async () => {
    await setupDb();
    container = createContainer(logger);
  });

  afterAll(async () => {
    await teardownDb();
  });

  beforeEach(async () => {
    await cleanupDb(mongoDb, [COLLECTIONS.JOBS_TRADE_MANAGER]);
  });

  it('should register and discover job via decorator', async () => {
    // SampleJob is registered with @RegisterJob('sample-job')
    // Verify it's in the registry
    const JobClass = JobRegistry.get('sample-job');
    expect(JobClass).toBeDefined();
    expect(JobClass).toBe(SampleJob);
  });

  it('should allow JobManager to find registered job', async () => {
    const jobConfig: Job = {
      jobId: 'sample-job',
      name: 'registry-test-job',
      isActive: true,
      config: {
        cronExpression: '* * * * *',
      },
    } as Job;

    await tradeManagerJobRepository.create(jobConfig);

    // JobManager should be able to find and instantiate the job
    await container.jobManager.init();

    const job = container.jobManager.getJobByName('registry-test-job');
    expect(job).toBeDefined();
    expect(job).toBeInstanceOf(SampleJob);
  });

  it('should handle multiple job instances of the same type', async () => {
    // Create multiple instances of the same job type
    const job1: Job = {
      jobId: 'sample-job',
      name: 'registry-instance-1',
      isActive: true,
      config: {
        cronExpression: '* * * * *',
      },
    } as Job;

    const job2: Job = {
      jobId: 'sample-job',
      name: 'registry-instance-2',
      isActive: true,
      config: {
        cronExpression: '0 * * * *',
      },
    } as Job;

    await tradeManagerJobRepository.create(job1);
    await tradeManagerJobRepository.create(job2);

    await container.jobManager.init();

    // Both instances should be created from the same registered class
    const instance1 = container.jobManager.getJobByName('registry-instance-1');
    const instance2 = container.jobManager.getJobByName('registry-instance-2');

    expect(instance1).toBeDefined();
    expect(instance2).toBeDefined();
    expect(instance1).toBeInstanceOf(SampleJob);
    expect(instance2).toBeInstanceOf(SampleJob);

    // They should be different instances
    expect(instance1).not.toBe(instance2);

    // But same class
    expect(instance1?.constructor).toBe(instance2?.constructor);
  });

  it('should return undefined for non-registered jobId', () => {
    const JobClass = JobRegistry.get('non-existent-job-id');
    expect(JobClass).toBeUndefined();
  });
});
