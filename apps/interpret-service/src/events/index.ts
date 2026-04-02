/**
 * Purpose: Manage lifecycle of all stream consumers.
 * Provides a registry to start and stop multiple consumers independently.
 */

import * as Sentry from '@sentry/node';
import Redis from 'ioredis';
import {
  RedisStreamConsumer,
  StreamTopic,
  LoggerInstance,
  createConsumerGroup,
  StreamConsumerMode,
  MessageType,
  MessageValidator,
} from '@telegram-trading-bot-mini/shared/utils';

import { config } from '../config';
import { TranslateRequestHandler } from './consumers/translate-request-handler';
import { ConsumerRegistry } from '../interfaces/consumer.interface';
import { Container } from '../interfaces/container.interface';

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

  // Determine starting ID based on per-stream consumer mode
  const requestsConsumerMode = config('STREAM_CONSUMER_MODE_REQUESTS');
  const requestsStartId =
    requestsConsumerMode === StreamConsumerMode.BEGINNING ? '0' : '$';

  // Create consumer group for translation requests (if it doesn't exist)
  await createConsumerGroup(
    redis,
    StreamTopic.TRANSLATE_REQUESTS,
    getConsumerGroupName(),
    requestsStartId,
  );

  // Create request consumer with validator
  const requestConsumer = new RedisStreamConsumer({
    url: redisUrl,
    errorCapture: Sentry,
    logger,
    validator: new MessageValidator(),
  });

  logger.info(
    { requestsConsumerMode, requestsStartId },
    'Stream consumers created with per-stream consumer modes',
  );

  return {
    requestConsumer,
  };
}

/**
 * Start all consumers
 */
export function startConsumers(
  consumers: ConsumerRegistry,
  container: Container,
): void {
  const translateRequestHandler = new TranslateRequestHandler(
    container.aiService,
    container.streamPublisher,
    container.telegramMessageRepository,
    container.logger,
    Sentry,
  );

  // Start request consumer
  consumers.requestConsumer.start<MessageType.TRANSLATE_MESSAGE_REQUEST>(
    StreamTopic.TRANSLATE_REQUESTS,
    getConsumerGroupName(),
    getConsumerName(),
    (message, id) => translateRequestHandler.handle(message, id),
  );

  container.logger.info('All stream consumers started');
}

/**
 * Stop all consumers gracefully
 */
export async function stopConsumers(
  consumers: ConsumerRegistry,
  logger: LoggerInstance,
): Promise<void> {
  logger.info('Stopping stream consumers...');

  await consumers.requestConsumer.stop();

  logger.info('All stream consumers stopped');
}
