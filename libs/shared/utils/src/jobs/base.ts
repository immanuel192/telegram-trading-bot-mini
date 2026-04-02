import { CronJob } from 'cron';
import { Job } from './interfaces';
import { LoggerInstance } from '../interfaces';

/**
 * Abstract Base Job class
 * Handles cron scheduling and execution lifecycle
 * @template TParams - Type of parameters accepted by the job (default: any)
 * @template TContainer - Type of the dependency injection container
 */
export abstract class BaseJob<TContainer = any, TParams = any> {
  protected jobConfig: Job;
  protected cronJob: CronJob | null = null;
  protected logger: LoggerInstance;
  protected container: TContainer;

  constructor(jobConfig: Job, logger: LoggerInstance, container: TContainer) {
    this.jobConfig = jobConfig;
    this.logger = logger;
    this.container = container;
  }

  /**
   * Initialize the job
   * Can be overridden to add custom initialization logic
   */
  async init(): Promise<void> {
    this.logger.debug({ jobId: this.jobConfig.jobId }, 'Initializing job');

    // Create cron job if expression is valid
    if (this.jobConfig.config.cronExpression) {
      this.cronJob = new CronJob(
        this.jobConfig.config.cronExpression,
        async () => {
          await this.execute();
        },
        null,
        false,
        this.jobConfig.config.timezone || 'UTC'
      );
    }
  }

  /**
   * Start the scheduled job
   */
  start(): void {
    if (this.cronJob) {
      this.cronJob.start();
      this.logger.info(
        {
          jobId: this.jobConfig.jobId,
          jobName: this.jobConfig.name,
          nextRun: this.cronJob.nextDate().toISO(),
        },
        'Job started'
      );
    } else {
      this.logger.warn(
        { jobId: this.jobConfig.jobId, jobName: this.jobConfig.name },
        'Cannot start job: No cron job initialized'
      );
    }
  }

  /**
   * Stop the scheduled job
   */
  stop(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.logger.info(
        {
          jobId: this.jobConfig.jobId,
          jobName: this.jobConfig.name,
        },
        'Job stopped'
      );
    }
  }

  /**
   * Manually trigger the job execution with optional parameters
   * @param options - Trigger options containing params and traceToken
   */
  async trigger(options?: {
    params?: TParams;
    traceToken?: string;
  }): Promise<void> {
    this.logger.info(
      {
        jobId: this.jobConfig.jobId,
        jobName: this.jobConfig.name,
        params: options?.params,
        traceToken: options?.traceToken,
      },
      'Job manually triggered'
    );
    await this.execute(options?.params, options?.traceToken);
  }

  /**
   * Execute the job logic
   * Must be implemented by concrete classes
   */
  protected async execute(
    params?: TParams,
    traceToken?: string
  ): Promise<void> {
    try {
      this.logger.debug(
        {
          jobId: this.jobConfig.jobId,
          jobName: this.jobConfig.name,
          params,
          traceToken,
        },
        'Executing job logic'
      );
      await this.onTick(params, traceToken);
      await this.onComplete();
    } catch (error) {
      this.logger.error(
        {
          jobId: this.jobConfig.jobId,
          jobName: this.jobConfig.name,
          error,
        },
        'Job execution failed'
      );
      // We don't rethrow here to prevent crashing the scheduler
      // Sentry capture should be handled by the logger or error handler
    }
  }

  /**
   * Actual business logic of the job
   * @param params - Optional parameters passed to the job
   * @param traceToken - Optional trace token for distributed tracing
   */
  protected abstract onTick(
    params?: TParams,
    traceToken?: string
  ): Promise<void>;

  /**
   * Called after successful execution
   */
  protected async onComplete(): Promise<void> {
    this.logger.debug(
      {
        jobId: this.jobConfig.jobId,
        jobName: this.jobConfig.name,
      },
      'Job execution completed'
    );
  }

  /**
   * Get the job configuration
   */
  getConfig(): Job {
    return this.jobConfig;
  }
}
