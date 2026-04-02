import pino from 'pino';
import { Queue, createQueue } from './queue';
import {
  PushNotificationSendOptions,
  PushSaferClient,
} from './interfaces/push-notification.interface';

const push = require('pushsafer-notifications');

/**
 * Push notification service configuration
 */
export interface PushNotificationServiceConfig {
  /**
   * PushSafer API key
   */
  apiKey: string;
  /**
   * Queue concurrency level
   * @default 2
   */
  concurrency?: number;
  /**
   * Optional logger
   */
  logger?: pino.Logger;
}

/**
 * Push notification service using fastq queue
 */
export class PushNotificationService {
  private client: PushSaferClient;
  private queue: Queue<PushNotificationSendOptions>;
  private logger?: pino.Logger;

  constructor(config: PushNotificationServiceConfig) {
    const { apiKey, concurrency = 2, logger } = config;
    this.logger = logger;

    // Initialize PushSafer client
    this.client = new push({
      k: apiKey,
    });

    // Create queue with executor
    this.queue = createQueue<PushNotificationSendOptions>(
      this.executor.bind(this),
      {
        concurrency,
        logger,
        onError: this.handleError.bind(this),
      }
    );
  }

  /**
   * Executor function that processes each notification
   */
  private async executor(options: PushNotificationSendOptions): Promise<any> {
    return new Promise((resolve, reject) => {
      this.client.send(options, (err: any, result: any) => {
        if (err) {
          if (this.logger) {
            this.logger.error(
              { err, traceToken: options.traceToken },
              'Push notification failed'
            );
          }
          return reject(err);
        }

        if (this.logger) {
          this.logger.info(
            { result, traceToken: options.traceToken },
            'Push notification sent'
          );
        }
        return resolve(result);
      });
    });
  }

  /**
   * Handle queue errors
   */
  private handleError(err: Error, options: PushNotificationSendOptions): void {
    if (this.logger && err) {
      this.logger.error(
        { err, traceToken: options.traceToken },
        'Error when pushing notification'
      );
    }
  }

  /**
   * Send a push notification
   * @param options - Notification options
   */
  send(options: PushNotificationSendOptions): Promise<any> {
    return this.queue.push(options);
  }

  /**
   * Wait for all queued notifications to be sent
   * @returns Promise that resolves when queue is drained
   */
  drain(): Promise<void> {
    if (this.logger) {
      this.logger.info('Draining notification queue');
    }
    return this.queue.drained();
  }

  /**
   * Get current queue length
   */
  getQueueLength(): number {
    return this.queue.length();
  }

  /**
   * Kill the queue (stop processing new notifications)
   */
  kill(): void {
    this.queue.kill();
  }

  /**
   * Kill the queue and drain remaining notifications
   */
  killAndDrain(): void {
    this.queue.killAndDrain();
  }
}

/**
 * Create a new push notification service instance
 * @param config - Service configuration
 * @returns PushNotificationService instance
 */
export function createPushNotificationService(
  config: PushNotificationServiceConfig
): PushNotificationService {
  return new PushNotificationService(config);
}
