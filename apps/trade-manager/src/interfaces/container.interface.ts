import {
  AccountRepository,
  JobRepository,
  TelegramMessageRepository,
  OrderRepository,
} from '@dal';
import {
  LoggerInstance,
  RedisStreamPublisher,
  PushNotificationService,
  IErrorCapture,
  JobManager,
  JobService,
  PriceCacheService,
} from '@telegram-trading-bot-mini/shared/utils';
import { AccountService } from '../services/account.service';
import { TelegramChannelCacheService } from '../services/telegram-channel-cache.service';
import { OrderService } from '../services/order.service';
import { CommandTransformerService } from '../services/command-transformer.service';
import { CommandProcessingPipelineService } from '../services/command-processing-pipeline.service';
import { OrderCacheService } from '../services/order-cache.service';

import { Redis } from 'ioredis';

export interface IHttpServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface Container {
  logger: LoggerInstance;
  errorCapture: IErrorCapture;
  redis: Redis;
  accountRepository: AccountRepository;
  jobRepository: JobRepository;
  telegramMessageRepository: TelegramMessageRepository;
  orderRepository: OrderRepository;
  streamPublisher: RedisStreamPublisher;
  pushNotificationService: PushNotificationService;
  jobManager: JobManager<Container>;
  jobService: JobService<Container>;
  accountService: AccountService;
  telegramChannelCacheService: TelegramChannelCacheService;
  orderService: OrderService;
  commandTransformerService: CommandTransformerService;
  priceCacheService: PriceCacheService;
  commandProcessingPipelineService: CommandProcessingPipelineService;
  orderCacheService: OrderCacheService;
}
