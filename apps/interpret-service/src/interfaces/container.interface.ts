/**
 * Purpose: Define the Container interface for interpret-service dependency injection.
 */

import { AccountRepository, PromptRuleRepository } from '@dal';
import {
  LoggerInstance,
  RedisStreamPublisher,
  PushNotificationService,
} from '@telegram-trading-bot-mini/shared/utils';
import { FastifyInstance } from 'fastify';
import { ConsumerRegistry } from './consumer.interface';
import { IAIService } from '../services/ai/ai-service.interface';
import { PromptCacheService } from '../services/prompt-cache.service';

export interface IHttpServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface Container {
  accountRepository: AccountRepository;
  promptRuleRepository: PromptRuleRepository;
  telegramMessageRepository: any; // TelegramMessageRepository from @dal
  logger: LoggerInstance;
  streamPublisher: RedisStreamPublisher;
  pushNotificationService: PushNotificationService;
  promptCacheService: PromptCacheService;
  aiService: IAIService;
}

export interface ServerContext {
  container: Container;
  httpServer: IHttpServer;
  httpApp: FastifyInstance;
  consumers: ConsumerRegistry;
}
