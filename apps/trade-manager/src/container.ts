/**
 * Purpose: Dependency injection container for trade-manager.
 * Wires up service instances only (no HTTP server or worker instances).
 * HTTP server and workers are managed at the outer level in server.ts.
 */

import {
  accountRepository,
  tradeManagerJobRepository,
  telegramMessageRepository,
  telegramChannelRepository,
  orderRepository,
} from '@dal';
import {
  LoggerInstance,
  RedisStreamPublisher,
  PushNotificationService,
  IErrorCapture,
  NoOpErrorCapture,
  JobService,
  PriceCacheService,
} from '@telegram-trading-bot-mini/shared/utils';

import { JobManager } from './jobs';

import { AccountService } from './services/account.service';
import { TelegramChannelCacheService } from './services/telegram-channel-cache.service';
import { OrderService } from './services/order.service';
import { CommandTransformerService } from './services/command-transformer.service';
import { CommandProcessingPipelineService } from './services/command-processing-pipeline.service';
import { OrderCacheService } from './services/order-cache.service';

import { config } from './config';
import { Container } from './interfaces';
import { Sentry } from './sentry';
import Redis from 'ioredis';

export function createContainer(logger: LoggerInstance): Container {
  // Create stream publisher for publishing events to downstream services
  // NOTE: MVP constraint - Redis Streams lack Kafka-style partition grouping
  // REQUIREMENT: Run exactly one instance to maintain message sequence
  const streamPublisher = new RedisStreamPublisher({
    url: config('REDIS_URL'),
  });

  // Initialize Redis for caching
  const redis = new Redis(config('REDIS_URL'));

  // Determine which error capture implementation to use
  // In production, use Sentry. In other environments, use NoOp (or Sentry if configured).
  // For now, we'll check if SENTRY_DSN is present.
  const sentryDsn = process.env.SENTRY_DSN;
  const errorCapture: IErrorCapture = sentryDsn
    ? Sentry
    : new NoOpErrorCapture();

  // Create base container with repositories and utilities
  const baseContainer: Partial<Container> = {
    // Create push notification service
    pushNotificationService: new PushNotificationService({
      apiKey: config('PUSHSAFER_API_KEY'),
      logger,
    }),
    redis,
    streamPublisher,
    errorCapture,
    accountRepository,
    jobRepository: tradeManagerJobRepository,
    telegramMessageRepository,
    orderRepository,
    logger,
  };

  logger.info('PushNotificationService initialized');
  logger.info('RedisStreamPublisher initialized');
  logger.info('Redis client initialized');

  // Create services (they need baseContainer for dependencies)
  const accountService = new AccountService(accountRepository, logger);

  // Create telegram channel cache service for fast channel code lookups
  const telegramChannelCacheService = new TelegramChannelCacheService(
    telegramChannelRepository,
  );
  logger.info('TelegramChannelCacheService initialized');

  // Create order service for managing Order entities
  const orderService = new OrderService(
    orderRepository,
    telegramMessageRepository,
    logger,
  );
  logger.info('OrderService initialized');
  const orderCacheService = new OrderCacheService(
    orderRepository,
    accountService,
    logger,
  );
  logger.info('OrderCacheService initialized');

  // Create command transformer service for converting AI commands to execution payloads
  const commandTransformerService = new CommandTransformerService(
    orderService,
    redis,
    logger,
  );
  logger.info('CommandTransformerService initialized');

  // Create price cache service
  // NOTE: Uses 'oanda' as default exchange code for setPrice/getPrice,
  // but we primarily use getPriceFromAnyExchange which scans all exchanges.
  const priceCacheService = new PriceCacheService('oanda', redis);
  logger.info('PriceCacheService initialized');

  // Create command processing pipeline service
  const commandProcessingPipelineService = new CommandProcessingPipelineService(
    logger,
    errorCapture,
    orderService,
    baseContainer.pushNotificationService,
    commandTransformerService,
    priceCacheService,
    streamPublisher,
    telegramMessageRepository,
  );
  logger.info('CommandProcessingPipelineService initialized');

  // Build complete container FIRST before creating JobManager
  // This ensures all services (including orderCacheService) are available to jobs
  const container: Container = {
    ...baseContainer,
    accountService,
    telegramChannelCacheService,
    orderService,
    commandTransformerService,
    priceCacheService,
    commandProcessingPipelineService,
    orderCacheService,
    // jobManager and jobService will be added below
  } as any;

  // NOW create JobManager with the complete container
  const jobManager = new JobManager(
    tradeManagerJobRepository,
    logger,
    container,
  );
  const jobService = new JobService(jobManager, logger);

  // Add jobManager and jobService to container
  container.jobManager = jobManager;
  container.jobService = jobService;

  // Document message types this service will publish:
  // - TRANSLATE_MESSAGE_REQUEST: Requests to interpret-service
  // - EXECUTE_ORDER_REQUEST: Requests to executor-service
  // - SYMBOL_FETCH_LATEST_PRICE: Requests to trade-executor

  return container;
}
