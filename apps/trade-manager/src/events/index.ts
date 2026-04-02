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
  getStreamStartId,
  MessageType,
  MessageValidator,
  StreamConsumerMode,
} from '@telegram-trading-bot-mini/shared/utils';

import { config } from '../config';
import { NewMessageHandler } from './consumers/new-message-handler';
import { TranslateResultHandler } from './consumers/translate-result-handler';
import { ExecuteOrderResultHandler } from './consumers/execute-order-result-handler';
import { LivePriceUpdateHandler } from './consumers/live-price-update-handler';
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
  const messagesConsumerMode = config('STREAM_CONSUMER_MODE_MESSAGES');
  const messagesStartId = getStreamStartId(messagesConsumerMode);

  const resultsConsumerMode = config('STREAM_CONSUMER_MODE_TRANSLATE_RESULTS');
  const resultsStartId = getStreamStartId(resultsConsumerMode);

  // For execution results, we default to NEW since it's not in config yet
  // This is safe as we don't need historical execution results
  const executionResultsStartId = getStreamStartId(StreamConsumerMode.NEW);

  const priceUpdatesConsumerMode = config('STREAM_CONSUMER_MODE_PRICE_UPDATES');
  const priceUpdatesStartId = getStreamStartId(priceUpdatesConsumerMode);

  // Create consumer groups in parallel (if they don't exist)
  await Promise.all([
    createConsumerGroup(
      redis,
      StreamTopic.MESSAGES,
      getConsumerGroupName(),
      messagesStartId,
    ),
    createConsumerGroup(
      redis,
      StreamTopic.TRANSLATE_RESULTS,
      getConsumerGroupName(),
      resultsStartId,
    ),
    createConsumerGroup(
      redis,
      StreamTopic.ORDER_EXECUTION_RESULTS,
      getConsumerGroupName(),
      executionResultsStartId,
    ),
    createConsumerGroup(
      redis,
      StreamTopic.PRICE_UPDATES,
      getConsumerGroupName(),
      priceUpdatesStartId,
    ),
  ]);

  // Create message consumer with validator
  const messageConsumer = new RedisStreamConsumer({
    url: redisUrl,
    errorCapture: Sentry,
    logger,
    validator: new MessageValidator(),
  });

  // Create result consumer with validator
  const resultConsumer = new RedisStreamConsumer({
    url: redisUrl,
    errorCapture: Sentry,
    logger,
    validator: new MessageValidator(),
  });

  // Create execution result consumer with validator
  const executionResultConsumer = new RedisStreamConsumer({
    url: redisUrl,
    errorCapture: Sentry,
    logger,
    validator: new MessageValidator(),
  });

  // Create price update consumer with validator
  const priceUpdateConsumer = new RedisStreamConsumer({
    url: redisUrl,
    errorCapture: Sentry,
    logger,
    validator: new MessageValidator(),
  });

  logger.info(
    {
      messagesConsumerMode,
      messagesStartId,
      resultsConsumerMode,
      resultsStartId,
      priceUpdatesConsumerMode,
      priceUpdatesStartId,
    },
    'Stream consumers created with per-stream consumer modes',
  );

  return {
    messageConsumer,
    resultConsumer,
    executionResultConsumer,
    priceUpdateConsumer,
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
  const newMessageHandler = new NewMessageHandler(
    container.telegramMessageRepository,
    container.accountRepository,
    container.streamPublisher,
    logger,
    container.errorCapture,
  );

  const translateResultHandler = new TranslateResultHandler(
    logger,
    container.errorCapture,
    container.telegramChannelCacheService,
    container.accountRepository,
    container.commandProcessingPipelineService,
  );

  const executeOrderResultHandler = new ExecuteOrderResultHandler(
    logger,
    container.errorCapture,
    container.orderCacheService,
  );

  const livePriceUpdateHandler = new LivePriceUpdateHandler(
    logger,
    container.errorCapture,
    container.orderCacheService,
    container.accountService,
    container.streamPublisher,
  );

  // Start message consumer
  consumers.messageConsumer.start<MessageType.NEW_MESSAGE>(
    StreamTopic.MESSAGES,
    getConsumerGroupName(),
    getConsumerName(),
    (message, id) => newMessageHandler.handle(message, id),
  );

  // Start result consumer
  consumers.resultConsumer.start<MessageType.TRANSLATE_MESSAGE_RESULT>(
    StreamTopic.TRANSLATE_RESULTS,
    getConsumerGroupName(),
    getConsumerName(),
    (message, id) => translateResultHandler.handle(message, id),
  );

  // Start execution result consumer
  consumers.executionResultConsumer.start<MessageType.EXECUTE_ORDER_RESULT>(
    StreamTopic.ORDER_EXECUTION_RESULTS,
    getConsumerGroupName(),
    getConsumerName(),
    (message, id) => executeOrderResultHandler.handle(message, id),
  );

  // Start price update consumer
  consumers.priceUpdateConsumer.start<MessageType.LIVE_PRICE_UPDATE>(
    StreamTopic.PRICE_UPDATES,
    getConsumerGroupName(),
    getConsumerName(),
    (message, id) => livePriceUpdateHandler.handle(message, id),
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

  // Stop all consumers in parallel
  await Promise.all([
    consumers.messageConsumer.stop(),
    consumers.resultConsumer.stop(),
    consumers.executionResultConsumer.stop(),
    consumers.priceUpdateConsumer.stop(),
  ]);

  logger.info('All stream consumers stopped');
}
