import fastq from 'fastq';
import type { queueAsPromised } from 'fastq';
import { LoggerInstance } from './interfaces';

/**
 * Generic queue options
 */
export interface QueueOptions<T> {
  /**
   * Concurrency level - number of tasks to process in parallel
   * @default 1
   */
  concurrency?: number;
  /**
   * Optional logger for queue operations
   */
  logger?: LoggerInstance;
  /**
   * Optional error handler
   */
  onError?: (err: Error, task: T) => void;
}

/**
 * Generic promise-based queue wrapper around fastq
 * Can be used for any type of task processing
 */
export class Queue<T> {
  private queue: queueAsPromised<T>;
  private logger?: LoggerInstance;
  private concurrency: number;

  constructor(
    executor: (task: T) => Promise<any>,
    options: QueueOptions<T> = {}
  ) {
    const { concurrency = 1, logger, onError } = options;
    this.concurrency = concurrency;
    this.logger = logger;

    this.queue = fastq.promise(executor, concurrency);

    // Set up error handler
    // NOTE: fastq's .error() handler is called for EVERY task completion
    // err will be null if the task succeeded, non-null if it failed
    this.queue.error((err, task) => {
      // Only process if there's an actual error
      if (!err) {
        return;
      }

      // Call the custom error handler
      if (onError) {
        onError(err, task);
      } else if (this.logger) {
        this.logger.error({ err, task }, 'Queue task error');
      }
    });
  }

  /**
   * Add a task to the queue
   * @param task - Task to be processed
   * @returns Promise that resolves when task is completed
   */
  push(task: T): Promise<any> {
    return this.queue.push(task);
  }

  /**
   * Wait for all tasks in the queue to complete
   * @returns Promise that resolves when queue is drained
   */
  drained(): Promise<void> {
    return this.queue.drained();
  }

  /**
   * Get the current queue length
   */
  length(): number {
    return this.queue.length();
  }

  /**
   * Get the concurrency level
   */
  getConcurrency(): number {
    return this.concurrency;
  }

  /**
   * Kill the queue (stop processing new tasks)
   */
  kill(): void {
    this.queue.kill();
  }

  /**
   * Kill the queue and drain remaining tasks
   */
  killAndDrain(): void {
    this.queue.killAndDrain();
  }
}

/**
 * Create a new queue instance
 * @param executor - Function that processes each task
 * @param options - Queue configuration options
 * @returns Queue instance
 */
export function createQueue<T>(
  executor: (task: T) => Promise<any>,
  options: QueueOptions<T> = {}
): Queue<T> {
  return new Queue(executor, options);
}
