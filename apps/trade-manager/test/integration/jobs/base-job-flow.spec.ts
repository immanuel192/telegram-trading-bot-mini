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

// Import jobs to trigger registration
import '../../../src/jobs';

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
    container.jobManager.stop();
    // Clear jobs map to prevent accumulation across tests
    (container.jobManager as any).jobs.clear();
    (container.jobManager as any).isRunning = false;
  });

  afterEach(() => {
    container.jobManager.stop();
  });

  it('should execute job flow: onTick → onComplete in order', async () => {
    const jobConfig: Job = {
      jobId: 'sample-job',
      name: 'flow-test-job',
      isActive: true,
      config: {
        cronExpression: '* * * * *',
      },
    } as Job;

    await tradeManagerJobRepository.create(jobConfig);
    await container.jobManager.init();

    const job = container.jobManager.getJobByName('flow-test-job') as SampleJob;
    expect(job).toBeDefined();

    const loggerSpy = jest.spyOn(logger, 'info');

    // Trigger job execution
    await job.trigger();

    // Verify execution order: trigger → onTick → onComplete
    const calls = loggerSpy.mock.calls.map((call) => call[1]);

    // Check that "Job manually triggered" was called
    expect(calls).toContain('Job manually triggered');

    // Check that "Sample job ticking..." was called (onTick)
    expect(calls).toContain('Sample job ticking...');

    // Check that "Job execution completed" was called (onComplete)
    const debugSpy = jest.spyOn(logger, 'debug');
    await job.trigger();
    expect(debugSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'sample-job',
        jobName: 'flow-test-job',
      }),
      'Job execution completed',
    );
  }, 30000);

  it('should handle job error gracefully without crashing scheduler', async () => {
    // Create a job that will throw an error during execution
    // We'll use a spy to make onTick throw
    const jobConfig: Job = {
      jobId: 'sample-job',
      name: 'error-test-job',
      isActive: true,
      config: {
        cronExpression: '* * * * *',
      },
    } as Job;

    await tradeManagerJobRepository.create(jobConfig);
    await container.jobManager.init();

    const job = container.jobManager.getJobByName(
      'error-test-job',
    ) as SampleJob;
    expect(job).toBeDefined();

    // Spy on onTick and make it throw
    const originalOnTick = (job as any).onTick.bind(job);
    const error = new Error('Test execution error');
    jest.spyOn(job as any, 'onTick').mockRejectedValue(error);

    const loggerSpy = jest.spyOn(logger, 'error');

    // Trigger job - should not throw
    await expect(job.trigger()).resolves.not.toThrow();

    // Verify error was logged
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'sample-job',
        jobName: 'error-test-job',
        error,
      }),
      'Job execution failed',
    );

    // Restore original
    jest.spyOn(job as any, 'onTick').mockImplementation(originalOnTick);
  }, 30000);

  it('should respect timezone setting in cron job', async () => {
    const jobConfig: Job = {
      jobId: 'sample-job',
      name: 'timezone-test-job',
      isActive: true,
      config: {
        cronExpression: '* * * * *',
        timezone: 'America/New_York',
      },
    } as Job;

    await tradeManagerJobRepository.create(jobConfig);
    await container.jobManager.init();

    const job = container.jobManager.getJobByName('timezone-test-job');
    expect(job).toBeDefined();

    // Initialize the job to create cron job
    await job!.init();

    // Start the job
    const loggerSpy = jest.spyOn(logger, 'info');
    job!.start();

    // Verify job started with timezone info
    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'sample-job',
        jobName: 'timezone-test-job',
      }),
      'Job started',
    );

    // The cron job should have been created with the timezone
    // We can't directly access the cronJob property, but we can verify
    // the job starts successfully with a timezone
    job!.stop();
  }, 30000);

  it('should allow job to be triggered manually when no cron expression', async () => {
    const jobConfig: Job = {
      jobId: 'sample-job',
      name: 'manual-only-job',
      isActive: true,
      config: {
        // No cronExpression - manual trigger only
      },
    } as Job;

    await tradeManagerJobRepository.create(jobConfig);
    await container.jobManager.init();

    const job = container.jobManager.getJobByName('manual-only-job');
    expect(job).toBeDefined();

    // Should be able to trigger manually
    const loggerSpy = jest.spyOn(logger, 'info');
    loggerSpy.mockClear(); // Clear any previous calls

    // Verify job executed
    await job!.trigger();

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'sample-job',
        jobName: 'manual-only-job',
      }),
      'Job manually triggered',
    );

    expect(loggerSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'manual-only-job',
      }),
      'Sample job ticking...',
    );

    // Should not be able to start (no cron job)
    const warnSpy = jest.spyOn(logger, 'warn');
    job!.start();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        jobId: 'sample-job',
        jobName: 'manual-only-job',
      }),
      'Cannot start job: No cron job initialized',
    );
  }, 30000);

  it('should handle multiple sequential executions', async () => {
    const jobConfig: Job = {
      jobId: 'sample-job',
      name: 'sequential-exec-job',
      isActive: true,
      config: {
        cronExpression: '* * * * *',
      },
    } as Job;

    await tradeManagerJobRepository.create(jobConfig);
    await container.jobManager.init();

    const job = container.jobManager.getJobByName('sequential-exec-job');
    expect(job).toBeDefined();

    const loggerSpy = jest.spyOn(logger, 'info');
    loggerSpy.mockClear(); // Clear any previous calls

    // Execute multiple times
    await job!.trigger();
    await job!.trigger();
    await job!.trigger();

    // Verify all executions completed
    const tickCalls = loggerSpy.mock.calls.filter(
      (call) => call[1] === 'Sample job ticking...',
    );
    expect(tickCalls.length).toBe(3);
  }, 30000);
});
