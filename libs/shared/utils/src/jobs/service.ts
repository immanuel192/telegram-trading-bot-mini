import * as Sentry from '@sentry/node';
import * as fastq from 'fastq';
import type { queueAsPromised } from 'fastq';
import { LoggerInstance } from '../interfaces';
import { JobManager } from './manager';

/**
 * Options for triggering a job manually
 */
interface TriggerJobOption<TParams = any> {
  /**
   * The unique name of the job instance to trigger
   */
  jobName: string;

  /**
   * Optional parameters to pass to the job
   */
  params?: TParams;

  /**
   * Optional trace token for distributed tracing
   */
  traceToken?: string;

  /**
   * Optional delay in milliseconds before executing the job
   * Useful for rate limiting or scheduling deferred execution
   * @default 0
   */
  delay?: number;
}

/**
 * Job Service
 * Handles manual job triggering and execution queuing
 * @template TContainer - Type of the dependency injection container
 */
export class JobService<TContainer = any> {
  private queue: queueAsPromised<TriggerJobOption>;

  constructor(
    private jobManager: JobManager<TContainer>,
    private logger: LoggerInstance
  ) {
    // Initialize queue with concurrency 1 (sequential execution)
    this.queue = fastq.promise(this.worker.bind(this), 1);
  }

  /**
   * Worker function for the queue
   * Schedules job execution with optional delay using setTimeout
   */
  private async worker(task: TriggerJobOption): Promise<void> {
    const { jobName, params, traceToken, delay } = task;
    this.logger.debug(
      { jobName, params, traceToken, delay },
      'Processing manual trigger task'
    );

    const job = this.jobManager.getJobByName(jobName);

    if (!job) {
      this.logger.warn({ jobName }, 'Job not found, skipping trigger');
      return;
    }

    // Schedule execution with delay (if specified)
    const executeJob = async () => {
      try {
        await job.trigger({ params, traceToken });
      } catch (error) {
        this.logger.error(
          { jobName, error },
          'Failed to execute triggered job'
        );
        Sentry.captureException(error, {
          extra: {
            jobName,
            params,
            traceToken,
          },
        });
      }
    };

    if (delay && delay > 0) {
      this.logger.debug(
        { jobName, delay },
        'Scheduling job execution with delay'
      );
      // Schedule asynchronously - don't block the worker
      setTimeout(() => {
        executeJob().catch((err) => {
          this.logger.error(
            { jobName, error: err },
            'Unexpected error in delayed job execution'
          );
        });
      }, delay);
    } else {
      // Execute immediately
      await executeJob();
    }
  }

  /**
   * Manually trigger a job by name with optional parameters
   * @param options - Trigger options including jobName, params, traceToken, and delay
   */
  async triggerJob<TParams = any>(
    options: TriggerJobOption<TParams>
  ): Promise<void> {
    this.logger.info(
      {
        jobName: options.jobName,
        params: options.params,
        traceToken: options.traceToken,
        delay: options.delay,
      },
      'Queueing manual job trigger'
    );
    await this.queue.push(options);
  }

  /**
   * Drain the queue (wait for all pending tasks to complete)
   * Used during graceful shutdown
   */
  async drainQueue(): Promise<void> {
    if (this.queue.idle()) {
      return;
    }

    this.logger.info('Draining job trigger queue...');
    await this.queue.drain();
    this.logger.info('Job trigger queue drained');
  }
}
