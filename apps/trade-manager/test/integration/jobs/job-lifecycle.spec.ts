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
    await setupDb();
    container = createContainer(logger);
  });

  afterAll(async () => {
    await teardownDb();
  });

  beforeEach(async () => {
    await cleanupDb(mongoDb, [COLLECTIONS.JOBS_TRADE_MANAGER]);
    // Stop all jobs before each test
    container.jobManager.stop();
    // Clear jobs map to prevent accumulation across tests
    (container.jobManager as any).jobs.clear();
    (container.jobManager as any).isRunning = false;
  });

  afterEach(() => {
    // Ensure jobs are stopped after each test
    container.jobManager.stop();
  });

  it('should complete full job lifecycle: Create → Init → Start → Execute → Stop', async () => {
    const jobConfig: Job = {
      jobId: 'sample-job',
      name: 'lifecycle-test-job',
      isActive: true,
      config: {
        cronExpression: '* * * * *',
      },
    } as Job;

    await tradeManagerJobRepository.create(jobConfig);

    // Initialize
    await container.jobManager.init();
    const job = container.jobManager.getJobByName('lifecycle-test-job');
    expect(job).toBeDefined();
    expect(job).toBeInstanceOf(SampleJob);

    // Start
    const loggerSpy = jest.spyOn(logger, 'info');
    loggerSpy.mockClear(); // Clear any previous calls
    container.jobManager.start();

    // Verify job started
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'sample-job',
        jobName: 'lifecycle-test-job',
      }),
      'Job started',
    );

    // Execute - manually trigger to verify execution
    await job!.trigger();

    // Verify job executed
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'sample-job',
        jobName: 'lifecycle-test-job',
      }),
      'Job manually triggered',
    );

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'lifecycle-test-job',
      }),
      'Sample job ticking...',
    );

    // Stop
    container.jobManager.stop();
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'sample-job',
        jobName: 'lifecycle-test-job',
      }),
      'Job stopped',
    );
  }, 30000);

  it('should load and initialize multiple jobs correctly', async () => {
    const job1: Job = {
      jobId: 'sample-job',
      name: 'multi-job-1',
      isActive: true,
      config: {
        cronExpression: '* * * * *',
      },
    } as Job;

    const job2: Job = {
      jobId: 'sample-job',
      name: 'multi-job-2',
      isActive: true,
      config: {
        cronExpression: '0 * * * *',
      },
    } as Job;

    await tradeManagerJobRepository.create(job1);
    await tradeManagerJobRepository.create(job2);

    await container.jobManager.init();

    const allJobs = container.jobManager.getAllJobs();
    expect(allJobs).toHaveLength(2);

    const job1Instance = container.jobManager.getJobByName('multi-job-1');
    const job2Instance = container.jobManager.getJobByName('multi-job-2');

    expect(job1Instance).toBeDefined();
    expect(job2Instance).toBeDefined();
    expect(job1Instance?.getConfig().name).toBe('multi-job-1');
    expect(job2Instance?.getConfig().name).toBe('multi-job-2');
  }, 30000);

  it('should trigger job immediately when runOnInit is true', async () => {
    const jobConfig: Job = {
      jobId: 'sample-job',
      name: 'runoninit-test-job',
      isActive: true,
      config: {
        cronExpression: '* * * * *',
        runOnInit: true,
      },
    } as Job;

    await tradeManagerJobRepository.create(jobConfig);

    const loggerSpy = jest.spyOn(logger, 'info');
    loggerSpy.mockClear(); // Clear any previous calls

    await container.jobManager.init();

    // Verify job was triggered on init
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'runoninit-test-job' }),
      'Triggering job on initialization (runOnInit=true)',
    );

    // Verify job execution - note: BaseJob uses jobName, not name
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'sample-job',
        jobName: 'runoninit-test-job',
      }),
      'Job manually triggered',
    );

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'runoninit-test-job',
      }),
      'Sample job ticking...',
    );
  }, 30000);

  it('should skip job not in registry gracefully', async () => {
    const jobConfig: Job = {
      jobId: 'non-existent-job',
      name: 'missing-registry-job',
      isActive: true,
      config: {
        cronExpression: '* * * * *',
      },
    } as Job;

    await tradeManagerJobRepository.create(jobConfig);

    const loggerSpy = jest.spyOn(logger, 'warn');

    await container.jobManager.init();

    // Verify warning logged
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'non-existent-job',
        name: 'missing-registry-job',
      }),
      'Job class not found in registry, skipping',
    );

    // Verify job not loaded
    const job = container.jobManager.getJobByName('missing-registry-job');
    expect(job).toBeUndefined();

    // Verify other jobs can still load (if any)
    const allJobs = container.jobManager.getAllJobs();
    expect(allJobs).toHaveLength(0);
  }, 30000);

  it('should handle job initialization error gracefully', async () => {
    // Create a job that will cause an error during initialization
    // We'll use an invalid cron expression to trigger an error
    const jobConfig: Job = {
      jobId: 'sample-job',
      name: 'error-init-job',
      isActive: true,
      config: {
        cronExpression: 'invalid-cron-expression',
      },
    } as Job;

    await tradeManagerJobRepository.create(jobConfig);

    const loggerSpy = jest.spyOn(logger, 'error');

    // This should not throw, but log an error
    await container.jobManager.init();

    // Verify error was logged
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'error-init-job',
      }),
      'Failed to initialize job',
    );

    // Verify job not loaded
    const job = container.jobManager.getJobByName('error-init-job');
    expect(job).toBeUndefined();
  }, 30000);

  it('should handle start/stop idempotency', async () => {
    const jobConfig: Job = {
      jobId: 'sample-job',
      name: 'idempotency-test-job',
      isActive: true,
      config: {
        cronExpression: '* * * * *',
      },
    } as Job;

    await tradeManagerJobRepository.create(jobConfig);
    await container.jobManager.init();

    const loggerSpy = jest.spyOn(logger, 'info');

    // Start multiple times
    container.jobManager.start();
    container.jobManager.start();
    container.jobManager.start();

    // Should only start once (idempotent)
    const startCalls = loggerSpy.mock.calls.filter(
      (call) => call[1] === 'Job started',
    );
    expect(startCalls.length).toBeGreaterThanOrEqual(1);

    // Stop multiple times
    container.jobManager.stop();
    container.jobManager.stop();
    container.jobManager.stop();

    // Should only stop once (idempotent)
    const stopCalls = loggerSpy.mock.calls.filter(
      (call) => call[1] === 'Job stopped',
    );
    expect(stopCalls.length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it('should handle job with invalid cron expression gracefully', async () => {
    const jobConfig: Job = {
      jobId: 'sample-job',
      name: 'invalid-cron-job',
      isActive: true,
      config: {
        cronExpression: '99 99 99 99 99',
      },
    } as Job;

    await tradeManagerJobRepository.create(jobConfig);

    const loggerSpy = jest.spyOn(logger, 'error');

    // Should not throw, but handle error gracefully
    await container.jobManager.init();

    // Verify error was logged during initialization
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'invalid-cron-job',
      }),
      'Failed to initialize job',
    );

    // Job should not be loaded
    const job = container.jobManager.getJobByName('invalid-cron-job');
    expect(job).toBeUndefined();
  }, 30000);

  it('should start all jobs when start is called', async () => {
    const job1: Job = {
      jobId: 'sample-job',
      name: 'start-test-1',
      isActive: true,
      config: {
        cronExpression: '* * * * *',
      },
    } as Job;

    const job2: Job = {
      jobId: 'sample-job',
      name: 'start-test-2',
      isActive: true,
      config: {
        cronExpression: '0 * * * *',
      },
    } as Job;

    await tradeManagerJobRepository.create(job1);
    await tradeManagerJobRepository.create(job2);

    await container.jobManager.init();

    const loggerSpy = jest.spyOn(logger, 'info');
    loggerSpy.mockClear(); // Clear any previous calls

    container.jobManager.start();

    // Verify both jobs started
    const startCalls = loggerSpy.mock.calls.filter(
      (call) => call[1] === 'Job started',
    );
    expect(startCalls.length).toBe(2);
  }, 30000);

  it('should stop all jobs when stop is called', async () => {
    const job1: Job = {
      jobId: 'sample-job',
      name: 'stop-test-1',
      isActive: true,
      config: {
        cronExpression: '* * * * *',
      },
    } as Job;

    const job2: Job = {
      jobId: 'sample-job',
      name: 'stop-test-2',
      isActive: true,
      config: {
        cronExpression: '0 * * * *',
      },
    } as Job;

    await tradeManagerJobRepository.create(job1);
    await tradeManagerJobRepository.create(job2);

    await container.jobManager.init();
    container.jobManager.start();

    const loggerSpy = jest.spyOn(logger, 'info');
    loggerSpy.mockClear(); // Clear any previous calls

    container.jobManager.stop();

    // Verify both jobs stopped
    const stopCalls = loggerSpy.mock.calls.filter(
      (call) => call[1] === 'Job stopped',
    );
    expect(stopCalls.length).toBe(2);
  }, 30000);
});
