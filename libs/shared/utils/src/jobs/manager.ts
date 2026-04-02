import { LoggerInstance } from '../interfaces';
import { BaseJob } from './base';
import { JobRegistry } from './registry';
import { Job } from './interfaces';

/**
 * Minimal interface for Job Repository
 * Apps should provide their own implementation from @dal
 */
export interface IJobRepository {
  findAllActive(): Promise<Job[]>;
}

/**
 * Job Manager
 * Handles loading, initialization, and lifecycle of all jobs
 * @template TContainer - Type of the dependency injection container
 */
export class JobManager<TContainer = any> {
  private jobs: Map<string, BaseJob<TContainer, any>> = new Map();
  private isRunning = false;

  constructor(
    private jobRepository: IJobRepository,
    private logger: LoggerInstance,
    private container: TContainer
  ) {}

  /**
   * Initialize all active jobs from the database
   */
  async init(): Promise<void> {
    this.logger.info('Initializing Job Manager...');

    try {
      // Load all active jobs
      const activeJobs = await this.jobRepository.findAllActive();
      this.logger.info(
        { count: activeJobs.length },
        'Found active jobs in database'
      );

      for (const jobConfig of activeJobs) {
        const JobClass = JobRegistry.get(jobConfig.jobId);

        if (!JobClass) {
          this.logger.warn(
            { jobId: jobConfig.jobId, name: jobConfig.name },
            'Job class not found in registry, skipping'
          );
          continue;
        }

        try {
          const jobInstance = new JobClass(
            jobConfig,
            this.logger,
            this.container
          );
          await jobInstance.init();
          this.jobs.set(jobConfig.name, jobInstance);
          this.logger.debug({ name: jobConfig.name }, 'Job initialized');

          // Trigger job immediately if runOnInit is true
          if (jobConfig.config.runOnInit) {
            this.logger.info(
              { name: jobConfig.name },
              'Triggering job on initialization (runOnInit=true)'
            );
            await jobInstance.trigger();
          }
        } catch (error) {
          this.logger.error(
            { name: jobConfig.name, error },
            'Failed to initialize job'
          );
        }
      }

      this.logger.info(
        { count: this.jobs.size },
        'Job Manager initialized successfully'
      );
    } catch (error) {
      this.logger.error({ error }, 'Failed to initialize Job Manager');
      throw error;
    }
  }

  /**
   * Start all scheduled jobs
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.logger.info('Starting all jobs...');
    for (const [name, job] of this.jobs) {
      try {
        job.start();
      } catch (error) {
        this.logger.error({ name, error }, 'Failed to start job');
      }
    }
    this.isRunning = true;
  }

  /**
   * Stop all scheduled jobs
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.logger.info('Stopping all jobs...');
    for (const [name, job] of this.jobs) {
      try {
        job.stop();
      } catch (error) {
        this.logger.error({ name, error }, 'Failed to stop job');
      }
    }
    this.isRunning = false;
  }

  /**
   * Get a job instance by name
   */
  getJobByName(name: string): BaseJob<TContainer, any> | undefined {
    return this.jobs.get(name);
  }

  /**
   * Get all loaded jobs
   */
  getAllJobs(): BaseJob<TContainer, any>[] {
    return Array.from(this.jobs.values());
  }
}
