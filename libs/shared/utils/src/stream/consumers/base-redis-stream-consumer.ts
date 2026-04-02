/**
 * Purpose: Abstract base class for Redis Stream consumers
 *
 * Responsibilities:
 * - Manage Redis client connection
 * - Fetch messages using XREADGROUP
 * - Parse raw Redis messages into StreamMessage format
 * - Validate messages (schema + expiration)
 * - ACK messages (XACK)
 * - Capture errors via Sentry
 * - Provide lifecycle hooks (start/stop/close)
 *
 * This base class extracts shared logic from RedisStreamConsumer and BatchStreamConsumer,
 * allowing both implementations to reuse common Redis operations while implementing
 * their own processing strategies.
 */

import Redis from 'ioredis';
import { IErrorCapture } from '../../error-capture';
import {
  StreamMessage,
  StreamTopic,
  RetryConfig,
  IMessageValidator,
  RedisStreamConsumerConfig,
} from '../stream-interfaces';
import { MessageType } from '../../interfaces/messages/message-type';
import { DefaultMessageValidator } from '../validators/default-message-validator';
import { LoggerInstance } from '../../interfaces';

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 1,
  initialDelayMs: 500,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Parsed message with ID
 */
export interface ParsedMessage<T extends MessageType> {
  id: string;
  message: StreamMessage<T>;
}

/**
 * Abstract base class for Redis Stream consumers
 * Subclasses must implement their own processing strategy
 */
export abstract class BaseRedisStreamConsumer {
  protected client: Redis;
  protected isRunning = false;
  protected errorCapture?: IErrorCapture;
  protected validator: IMessageValidator;
  protected retryConfig: RetryConfig;
  protected logger?: LoggerInstance;
  protected blockTimeMs: number;
  protected consumeLoopPromise?: Promise<void>;

  constructor(config: RedisStreamConsumerConfig) {
    // Native Redis with ioredis
    this.client = new Redis(config.url);
    this.blockTimeMs = config.blockTimeMs ?? 500; // Default 500ms block

    this.errorCapture = config.errorCapture;
    this.validator = config.validator || new DefaultMessageValidator();
    this.retryConfig = config.retryConfig || DEFAULT_RETRY_CONFIG;
    this.logger = config.logger;
  }

  /**
   * Fetch messages from Redis Stream using XREADGROUP
   * @param topic - Stream topic name
   * @param groupName - Consumer group name
   * @param consumerName - Consumer name
   * @param count - Number of messages to fetch
   * @returns Array of raw messages from Redis
   */
  protected async fetchMessages(
    topic: StreamTopic,
    groupName: string,
    consumerName: string,
    count: number
  ): Promise<[string, string[]][]> {
    const response = await this.client.xreadgroup(
      'GROUP',
      groupName,
      consumerName,
      'COUNT',
      count,
      'BLOCK',
      this.blockTimeMs,
      'STREAMS',
      topic as string,
      '>'
    );

    if (!response || response.length === 0) {
      return [];
    }

    // ioredis format: [[streamName, [[id, [field, value, ...]], ...]]]
    const [, messages] = response[0] as [string, [string, string[]][]];
    return messages;
  }

  /**
   * Parse a raw Redis message into StreamMessage format
   * @param id - Message ID
   * @param fieldsArray - Array of field-value pairs from Redis
   * @returns Parsed message or null if parsing fails
   */
  protected parseMessage<T extends MessageType>(
    id: string,
    fieldsArray: string[]
  ): ParsedMessage<T> | null {
    try {
      // Convert fields array to object
      const fields: Record<string, any> = {};
      for (let i = 0; i < fieldsArray.length; i += 2) {
        fields[fieldsArray[i]] = fieldsArray[i + 1];
      }

      const { version, type, payload } = fields;

      const message: StreamMessage<T> = {
        version,
        type: type as T,
        // Parse JSON payload
        payload: typeof payload === 'string' ? JSON.parse(payload) : payload,
      };

      return { id, message };
    } catch (error) {
      this.logger?.error(
        {
          id,
          error: error instanceof Error ? error.message : String(error),
        },
        'Failed to parse message'
      );
      this.errorCapture?.captureException(
        error instanceof Error ? error : new Error(String(error)),
        { id }
      );
      return null;
    }
  }

  /**
   * Validate a message (schema + expiration)
   * @param message - Message to validate
   * @param id - Message ID
   * @returns true if valid, false otherwise
   */
  protected async validateMessage<T extends MessageType>(
    message: StreamMessage<T>,
    id: string
  ): Promise<boolean> {
    // Schema validation
    const validationResult = await this.validator.validate(message);
    if (!validationResult.valid) {
      this.logger?.error(
        {
          id,
          message,
          validationError: validationResult.error,
        },
        `Message validation failed: ${
          validationResult.error || 'Unknown error'
        }`
      );
      this.errorCapture?.captureException(
        new Error(
          `Message validation failed: ${
            validationResult.error || 'Unknown error'
          }`
        ),
        { id, message, validationError: validationResult.error }
      );
      return false;
    }

    // Expiration check
    if (this.validator.isExpired(message)) {
      this.logger?.error({ id, message }, 'Message expired');
      this.errorCapture?.captureException(new Error('Message expired'), {
        id,
        message,
      });
      return false;
    }

    return true;
  }

  /**
   * Acknowledge a message in Redis Stream
   * @param topic - Stream topic name
   * @param groupName - Consumer group name
   * @param id - Message ID
   */
  protected async ackMessage(
    topic: StreamTopic,
    groupName: string,
    id: string
  ): Promise<void> {
    await this.client.xack(topic as string, groupName, id);
  }

  /**
   * Sleep utility for retry delays
   * @param ms - Milliseconds to sleep
   */
  protected sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Start consuming messages from the stream in the background.
   * This method returns immediately and does not block.
   * Use stop() to gracefully shutdown the consumer.
   *
   * Note: Consumer group should be created before calling start()
   * Use createConsumerGroup() helper function to create the group
   *
   * @param topic - Stream topic name
   * @param groupName - Consumer group name
   * @param consumerName - Consumer name
   * @param handler - Message handler function (type varies by implementation)
   */
  start(
    topic: StreamTopic,
    groupName: string,
    consumerName: string,
    handler: any
  ): void {
    if (this.isRunning) {
      throw new Error('Consumer is already running');
    }

    this.isRunning = true;

    // Start the consume loop in the background
    this.consumeLoopPromise = this._consumeLoop(
      topic,
      groupName,
      consumerName,
      handler
    ).catch((error) => {
      // Capture any unhandled errors from the consume loop
      this.logger?.error({ error }, 'Fatal error in consume loop');
      this.errorCapture?.captureException(error as Error, {
        topic,
        groupName,
        consumerName,
      });
    });
  }

  /**
   * Internal consume loop - implemented by derived classes
   * Each consumer type implements its own processing strategy
   *
   * @param topic - Stream topic name
   * @param groupName - Consumer group name
   * @param consumerName - Consumer name
   * @param handler - Message handler function (type varies by implementation)
   */
  protected abstract _consumeLoop(
    topic: StreamTopic,
    groupName: string,
    consumerName: string,
    handler: any
  ): Promise<void>;

  /**
   * Stop the consumer
   * Subclasses should override this to implement graceful shutdown
   */
  async stop(): Promise<void> {
    this.isRunning = false;
  }

  /**
   * Close the consumer and Redis connection
   */
  async close(): Promise<void> {
    await this.stop();
    await this.client.quit();
  }
}
