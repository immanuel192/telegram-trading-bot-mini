/**
 * Purpose: Manage lifecycle of all stream consumers for executor-service.
 * Provides a registry to start and stop consumers independently.
 */

import * as Sentry from '@sentry/node';
import Redis from 'ioredis';
import {
  RedisStreamConsumer,
  StreamTopic,
  LoggerInstance,
  createConsumerGroup,
  getStreamStartId,
  MessageType,
  MessageValidator,
} from '@telegram-trading-bot-mini/shared/utils';

import { config } from '../config';
import { OrderExecutionHandler } from './consumers/order-execution-handler';
import { Container } from '../interfaces';

export * from './consumers/order-execution-handler';

/**
 * Consumer registry for executor-service
 */
export interface ConsumerRegistry {
  executionConsumer: RedisStreamConsumer;
}

const getConsumerGroupName = () => config('APP_NAME');
/**
 * This is only correct when we have one consumer. If we have more than one, we should use K8S host name or something else.
 */
const getConsumerName = () => config('APP_NAME');

/**
 * Create and initialize all stream consumers
 */
export async function createConsumers(
  logger: LoggerInstance,
): Promise<ConsumerRegistry> {
  const redisUrl = config('REDIS_URL');

  // Create Redis client for consumer group creation
  const redis = new Redis(redisUrl);

  // Determine starting ID based on consumer mode
  const executionConsumerMode = config(
    'STREAM_CONSUMER_MODE_ORDER_EXECUTION_REQUESTS',
  );
  const executionStartId = getStreamStartId(executionConsumerMode);

  // Create consumer group (if it doesn't exist)
  await createConsumerGroup(
    redis,
    StreamTopic.ORDER_EXECUTION_REQUESTS,
    getConsumerGroupName(),
    executionStartId,
  );

  // Create execution consumer with validator
  const executionConsumer = new RedisStreamConsumer({
    url: redisUrl,
    errorCapture: Sentry,
    logger,
    validator: new MessageValidator(),
  });

  logger.info(
    {
      executionConsumerMode,
      executionStartId,
    },
    'Stream consumer created with consumer mode',
  );

  return {
    executionConsumer,
  };
}

/**
 * Start all consumers
 */
export function startConsumers(
  consumers: ConsumerRegistry,
  container: Container,
  logger: LoggerInstance,
): void {
  const orderExecutionHandler = new OrderExecutionHandler(
    container.pipelineExecutor,
    logger,
    container.errorCapture,
  );

  // Start execution consumer
  consumers.executionConsumer.start(
    StreamTopic.ORDER_EXECUTION_REQUESTS,
    getConsumerGroupName(),
    getConsumerName(),
    (message, id) => orderExecutionHandler.handle(message, id),
  );

  logger.info('All stream consumers started');
}

/**
 * Stop all consumers gracefully
 */
export async function stopConsumers(
  consumers: ConsumerRegistry,
  logger: LoggerInstance,
): Promise<void> {
  logger.info('Stopping stream consumers...');

  await consumers.executionConsumer.stop();

  logger.info('All stream consumers stopped');
}
