/**
 * Purpose: Dependency injection container for telegram-service.
 * Wires up service instances only (no HTTP server or worker instances).
 * HTTP server and workers are managed at the outer level in startup.ts.
 */

import {
  configRepository,
  telegramChannelRepository,
  telegramMessageRepository,
} from '@dal';
import {
  LoggerInstance,
  RedisStreamPublisher,
  PushNotificationService,
} from '@telegram-trading-bot-mini/shared/utils';

import { config } from './config';
import { TelegramClientService } from './services/telegram-client.service';
import { Container } from './interfaces';

export function createContainer(logger: LoggerInstance): Container {
  // Create stream publisher
  const streamPublisher = new RedisStreamPublisher({
    url: config('REDIS_URL'),
  });

  // Create push notification service
  const pushNotificationService = new PushNotificationService({
    apiKey: config('PUSHSAFER_API_KEY'),
    logger,
  });
  logger.info('PushNotificationService initialized');

  // Wire up service instances with dependencies
  const telegramService = new TelegramClientService(
    configRepository,
    telegramChannelRepository,
    telegramMessageRepository,
    streamPublisher,
    logger,
    pushNotificationService,
  );

  return {
    configRepository,
    telegramChannelRepository,
    logger,
    telegramService,
    streamPublisher,
  };
}
