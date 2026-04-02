/**
 * Unit tests for JobManager
 */

import {
  BaseJob,
  Job,
  RegisterJob,
  JobManager,
  IJobRepository,
} from '../../../src/jobs';
import { fakeLogger } from '@telegram-trading-bot-mini/shared/test-utils';

// Test job classes
@RegisterJob('manager-test-job-1')
class ManagerTestJob1 extends BaseJob<any, any> {
  public executionCount = 0;

  protected async onTick(): Promise<void> {
    this.executionCount++;
  }
}

@RegisterJob('manager-test-job-2')
class ManagerTestJob2 extends BaseJob<any, any> {
  protected async onTick(): Promise<void> {
    // Test implementation
  }
}

@RegisterJob('failing-job')
class FailingJob extends BaseJob<any, any> {
  protected async onTick(): Promise<void> {
    throw new Error('Job execution failed');
  }
}

describe('JobManager', () => {
  let jobManager: JobManager<any>;
  let mockJobRepository: jest.Mocked<IJobRepository>;
  let mockContainer: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockContainer = {
      logger: fakeLogger,
      someService: { doSomething: jest.fn() },
    };

    mockJobRepository = {
      findAllActive: jest.fn(),
    };

    jobManager = new JobManager(mockJobRepository, fakeLogger, mockContainer);
  });

  describe('constructor', () => {
    it('should initialize with repository, logger, and container', () => {
      expect(jobManager).toBeInstanceOf(JobManager);
      expect(jobManager['jobRepository']).toBe(mockJobRepository);
      expect(jobManager['logger']).toBe(fakeLogger);
      expect(jobManager['container']).toBe(mockContainer);
    });

    it('should initialize with empty jobs map', () => {
      expect(jobManager['jobs'].size).toBe(0);
    });

    it('should initialize with isRunning as false', () => {
      expect(jobManager['isRunning']).toBe(false);
    });
  });

  describe('init', () => {
    it('should load and initialize active jobs from database', async () => {
      const jobConfigs: Job[] = [
        {
          jobId: 'manager-test-job-1',
          name: 'job-instance-1',
          isActive: true,
          config: {
            cronExpression: '* * * * *',
          },
        } as Job,
        {
          jobId: 'manager-test-job-2',
          name: 'job-instance-2',
          isActive: true,
          config: {
            cronExpression: '*/5 * * * *',
          },
        } as Job,
      ];

      mockJobRepository.findAllActive.mockResolvedValue(jobConfigs);

      await jobManager.init();

      expect(mockJobRepository.findAllActive).toHaveBeenCalled();
      expect(fakeLogger.info).toHaveBeenCalledWith(
        { count: 2 },
        'Found active jobs in database',
      );
      expect(jobManager['jobs'].size).toBe(2);
    });

    it('should skip jobs with unregistered jobId', async () => {
      const jobConfigs: Job[] = [
        {
          jobId: 'non-existent-job',
          name: 'invalid-job',
          isActive: true,
          config: {
            cronExpression: '* * * * *',
          },
        } as Job,
      ];

      mockJobRepository.findAllActive.mockResolvedValue(jobConfigs);

      await jobManager.init();

      expect(fakeLogger.warn).toHaveBeenCalledWith(
        expect.objectContaining({
          jobId: 'non-existent-job',
          name: 'invalid-job',
        }),
        'Job class not found in registry, skipping',
      );
      expect(jobManager['jobs'].size).toBe(0);
    });

    it('should trigger jobs with runOnInit=true', async () => {
      const jobConfigs: Job[] = [
        {
          jobId: 'manager-test-job-1',
          name: 'run-on-init-job',
          isActive: true,
          config: {
            cronExpression: '* * * * *',
            runOnInit: true,
          },
        } as Job,
      ];

      mockJobRepository.findAllActive.mockResolvedValue(jobConfigs);

      await jobManager.init();

      expect(fakeLogger.info).toHaveBeenCalledWith(
        { name: 'run-on-init-job' },
        'Triggering job on initialization (runOnInit=true)',
      );

      const job = jobManager.getJobByName('run-on-init-job') as ManagerTestJob1;
      expect(job.executionCount).toBe(1);
    });

    it('should not trigger jobs with runOnInit=false', async () => {
      const jobConfigs: Job[] = [
        {
          jobId: 'manager-test-job-1',
          name: 'no-run-on-init-job',
          isActive: true,
          config: {
            cronExpression: '* * * * *',
            runOnInit: false,
          },
        } as Job,
      ];

      mockJobRepository.findAllActive.mockResolvedValue(jobConfigs);

      await jobManager.init();

      const job = jobManager.getJobByName(
        'no-run-on-init-job',
      ) as ManagerTestJob1;
      expect(job.executionCount).toBe(0);
    });

    it('should handle job initialization errors gracefully', async () => {
      // Create a job that will fail during init
      @RegisterJob('init-failing-job')
      class InitFailingJob extends BaseJob<any, any> {
        override async init(): Promise<void> {
          throw new Error('Init failed');
        }

        protected async onTick(): Promise<void> {
          // Test
        }
      }

      const jobConfigs: Job[] = [
        {
          jobId: 'init-failing-job',
          name: 'failing-init-job',
          isActive: true,
          config: {
            cronExpression: '* * * * *',
          },
        } as Job,
      ];

      mockJobRepository.findAllActive.mockResolvedValue(jobConfigs);

      await jobManager.init();

      expect(fakeLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'failing-init-job',
        }),
        'Failed to initialize job',
      );
      expect(jobManager['jobs'].size).toBe(0);
    });

    it('should handle repository errors', async () => {
      const error = new Error('Database error');
      mockJobRepository.findAllActive.mockRejectedValue(error);

      await expect(jobManager.init()).rejects.toThrow('Database error');

      expect(fakeLogger.error).toHaveBeenCalledWith(
        { error },
        'Failed to initialize Job Manager',
      );
    });

    it('should log successful initialization', async () => {
      const jobConfigs: Job[] = [
        {
          jobId: 'manager-test-job-1',
          name: 'job-1',
          isActive: true,
          config: { cronExpression: '* * * * *' },
        } as Job,
      ];

      mockJobRepository.findAllActive.mockResolvedValue(jobConfigs);

      await jobManager.init();

      expect(fakeLogger.info).toHaveBeenCalledWith(
        { count: 1 },
        'Job Manager initialized successfully',
      );
    });
  });

  describe('start', () => {
    beforeEach(async () => {
      const jobConfigs: Job[] = [
        {
          jobId: 'manager-test-job-1',
          name: 'job-1',
          isActive: true,
          config: { cronExpression: '* * * * *' },
        } as Job,
        {
          jobId: 'manager-test-job-2',
          name: 'job-2',
          isActive: true,
          config: { cronExpression: '*/5 * * * *' },
        } as Job,
      ];

      mockJobRepository.findAllActive.mockResolvedValue(jobConfigs);
      await jobManager.init();
    });

    it('should start all loaded jobs', () => {
      jobManager.start();

      expect(fakeLogger.info).toHaveBeenCalledWith('Starting all jobs...');
      expect(jobManager['isRunning']).toBe(true);
    });

    it('should not start if already running', () => {
      jobManager.start();
      jest.clearAllMocks();

      jobManager.start();

      expect(fakeLogger.info).not.toHaveBeenCalled();
    });

    it('should handle job start errors gracefully', () => {
      const job = jobManager.getJobByName('job-1');
      jest.spyOn(job!, 'start').mockImplementation(() => {
        throw new Error('Start failed');
      });

      jobManager.start();

      expect(fakeLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'job-1' }),
        'Failed to start job',
      );
      expect(jobManager['isRunning']).toBe(true);
    });
  });

  describe('stop', () => {
    beforeEach(async () => {
      const jobConfigs: Job[] = [
        {
          jobId: 'manager-test-job-1',
          name: 'job-1',
          isActive: true,
          config: { cronExpression: '* * * * *' },
        } as Job,
      ];

      mockJobRepository.findAllActive.mockResolvedValue(jobConfigs);
      await jobManager.init();
      jobManager.start();
    });

    it('should stop all running jobs', () => {
      jobManager.stop();

      expect(fakeLogger.info).toHaveBeenCalledWith('Stopping all jobs...');
      expect(jobManager['isRunning']).toBe(false);
    });

    it('should not stop if not running', () => {
      jobManager.stop();
      jest.clearAllMocks();

      jobManager.stop();

      expect(fakeLogger.info).not.toHaveBeenCalled();
    });

    it('should handle job stop errors gracefully', () => {
      const job = jobManager.getJobByName('job-1');
      jest.spyOn(job!, 'stop').mockImplementation(() => {
        throw new Error('Stop failed');
      });

      jobManager.stop();

      expect(fakeLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'job-1' }),
        'Failed to stop job',
      );
      expect(jobManager['isRunning']).toBe(false);
    });
  });

  describe('getJobByName', () => {
    beforeEach(async () => {
      const jobConfigs: Job[] = [
        {
          jobId: 'manager-test-job-1',
          name: 'test-job',
          isActive: true,
          config: { cronExpression: '* * * * *' },
        } as Job,
      ];

      mockJobRepository.findAllActive.mockResolvedValue(jobConfigs);
      await jobManager.init();
    });

    it('should return job instance by name', () => {
      const job = jobManager.getJobByName('test-job');

      expect(job).toBeInstanceOf(ManagerTestJob1);
      expect(job?.getConfig().name).toBe('test-job');
    });

    it('should return undefined for non-existent job', () => {
      const job = jobManager.getJobByName('non-existent');

      expect(job).toBeUndefined();
    });

    it('should be case-sensitive', () => {
      const job1 = jobManager.getJobByName('test-job');
      const job2 = jobManager.getJobByName('Test-Job');

      expect(job1).toBeDefined();
      expect(job2).toBeUndefined();
    });
  });

  describe('getAllJobs', () => {
    it('should return empty array when no jobs loaded', () => {
      const jobs = jobManager.getAllJobs();

      expect(jobs).toEqual([]);
    });

    it('should return all loaded jobs', async () => {
      const jobConfigs: Job[] = [
        {
          jobId: 'manager-test-job-1',
          name: 'job-1',
          isActive: true,
          config: { cronExpression: '* * * * *' },
        } as Job,
        {
          jobId: 'manager-test-job-2',
          name: 'job-2',
          isActive: true,
          config: { cronExpression: '*/5 * * * *' },
        } as Job,
      ];

      mockJobRepository.findAllActive.mockResolvedValue(jobConfigs);
      await jobManager.init();

      const jobs = jobManager.getAllJobs();

      expect(jobs).toHaveLength(2);
      expect(jobs[0]).toBeInstanceOf(BaseJob);
      expect(jobs[1]).toBeInstanceOf(BaseJob);
    });

    it('should return a new array each time', async () => {
      const jobConfigs: Job[] = [
        {
          jobId: 'manager-test-job-1',
          name: 'job-1',
          isActive: true,
          config: { cronExpression: '* * * * *' },
        } as Job,
      ];

      mockJobRepository.findAllActive.mockResolvedValue(jobConfigs);
      await jobManager.init();

      const jobs1 = jobManager.getAllJobs();
      const jobs2 = jobManager.getAllJobs();

      expect(jobs1).not.toBe(jobs2);
      expect(jobs1).toEqual(jobs2);
    });
  });

  describe('Generic container type', () => {
    it('should support typed containers', async () => {
      interface CustomContainer {
        logger: any;
        customService: { getValue: () => string };
      }

      const customContainer: CustomContainer = {
        logger: fakeLogger,
        customService: { getValue: () => 'test-value' },
      };

      const typedJobManager = new JobManager<CustomContainer>(
        mockJobRepository,
        fakeLogger,
        customContainer,
      );

      @RegisterJob('typed-container-test-job')
      class TypedContainerJob extends BaseJob<CustomContainer, any> {
        public value?: string;

        protected async onTick(): Promise<void> {
          this.value = this.container.customService.getValue();
        }
      }

      const jobConfigs: Job[] = [
        {
          jobId: 'typed-container-test-job',
          name: 'typed-job',
          isActive: true,
          config: { cronExpression: '* * * * *' },
        } as Job,
      ];

      mockJobRepository.findAllActive.mockResolvedValue(jobConfigs);
      await typedJobManager.init();

      const job = typedJobManager.getJobByName(
        'typed-job',
      ) as TypedContainerJob;
      await job.trigger();

      expect(job.value).toBe('test-value');
    });
  });
});
