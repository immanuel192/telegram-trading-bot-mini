import { IErrorCapture } from '../error-capture';
import { MessageTypePayloadMap } from '../interfaces/messages';
import { MessageType } from '../interfaces/messages/message-type';
import { LoggerInstance, SentryDistributedTracing } from '../interfaces';

/**
 * Stream topic names
 */
export enum StreamTopic {
  /** Raw Telegram messages from telegram-service */
  MESSAGES = 'messages',
  /** Translation requests from trade-manager to interpret-service */
  TRANSLATE_REQUESTS = 'translate-requests',
  /** Translation results from interpret-service to trade-manager */
  TRANSLATE_RESULTS = 'translate-results',
  /** Symbol price fetch requests to trade-executor (future use) */
  PRICE_REQUESTS = 'price-requests',
  /** Order execution requests from trade-manager to executor-service */
  ORDER_EXECUTION_REQUESTS = 'order-execution-requests',
  /** Order execution results from executor-service to trade-manager */
  ORDER_EXECUTION_RESULTS = 'order-execution-results',
  /** Live price updates from executor-service to trade-manager */
  PRICE_UPDATES = 'price-updates',
}

/**
 * Redis Stream configuration
 */
export interface RedisStreamConfig {
  url: string;
  logger?: LoggerInstance; // Optional logger instance
}

export interface RedisStreamConsumerConfig extends RedisStreamConfig {
  errorCapture?: IErrorCapture;
  validator?: IMessageValidator;
  retryConfig?: RetryConfig;
  /** Block time in milliseconds for XREADGROUP (default: 500ms) */
  blockTimeMs?: number;
  /** Maximum number of groups to process concurrently (default: 10) */
  maxConcurrentGroups?: number;
}

/**
 * Base structure for stream messages
 */
export interface StreamMessage<T extends MessageType = MessageType>
  extends SentryDistributedTracing {
  version: string;
  type: T;
  payload: MessageTypePayloadMap[T];
}

/**
 * Message validation result
 */
export interface MessageValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Message validator interface
 */
export interface IMessageValidator {
  /**
   * Validate a stream message
   * @param message - The message to validate
   * @returns Validation result with error details if invalid
   */
  validate<T extends MessageType>(
    message: StreamMessage<T>
  ): Promise<MessageValidationResult>;

  /**
   * Check if a message has expired
   * @param message - The message to check
   * @returns true if expired, false otherwise
   */
  isExpired<T extends MessageType>(message: StreamMessage<T>): boolean;
}

/**
 * Stream publisher interface
 */
export interface IStreamPublisher {
  /**
   * Publish a message to a stream
   * @param topic - Stream topic name
   * @param message - Message to publish
   * @returns Stream entry ID
   */
  publish<T extends MessageType>(
    topic: StreamTopic,
    message: StreamMessage<T>
  ): Promise<string>;

  /**
   * Close the publisher connection
   */
  close(): Promise<void>;
}

/**
 * Retry configuration for stream consumer
 */
export interface RetryConfig {
  maxRetries: number;
  initialDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
}

/**
 * Single message handler type for RedisStreamConsumer
 * Processes one message at a time
 */
export type MessageHandler<T extends MessageType> = (
  message: StreamMessage<T>,
  id: string
) => Promise<void>;

/**
 * Batch message handler type for BatchStreamConsumer
 * Processes multiple messages in a batch and returns per-message results
 */
export type BatchMessageHandler<T extends MessageType> = (
  messages: Array<{
    message: StreamMessage<T>;
    id: string;
    groupKey: string;
  }>
) => Promise<
  Array<{
    id: string;
    success: boolean;
    error?: Error;
  }>
>;

/**
 * Stream consumer interface
 * Generic by handler type to support different processing strategies
 */
export interface IStreamConsumer<THandler = any> {
  /**
   * Start consuming messages from a stream in the background.
   * This method returns immediately and does not block.
   * @param topic - Stream topic name
   * @param groupName - Consumer group name
   * @param consumerName - Consumer name
   * @param handler - Message handler function (type varies by implementation)
   */
  start<T extends MessageType>(
    topic: StreamTopic,
    groupName: string,
    consumerName: string,
    handler: THandler
  ): void;

  /**
   * Stop consuming messages
   */
  stop(): Promise<void>;

  /**
   * Close the consumer connection
   */
  close(): Promise<void>;
}
