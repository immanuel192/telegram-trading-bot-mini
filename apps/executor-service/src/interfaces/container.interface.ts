/**
 * Purpose: Define the dependency injection container interface for executor-service.
 * Exports: Container interface for type-safe dependency injection.
 * Core Flow: Defines all service dependencies → Used by container.ts for wiring.
 */

import { AccountRepository, JobRepository, OrderRepository } from '@dal';
import {
  LoggerInstance,
  RedisStreamPublisher,
  IErrorCapture,
  JobManager,
  JobService,
} from '@telegram-trading-bot-mini/shared/utils';
import { Redis } from 'ioredis';
import { BrokerAdapterFactory } from '../adapters/factory';
import { PipelineOrderExecutorService } from '../services/order-handlers/pipeline-executor.service';
import { TokenManager } from '../services/token-manager.service';
import { AccountService } from '../services/account.service';

/**
 * Dependency injection container for executor-service
 * Contains all service dependencies for type-safe injection
 */
export interface Container {
  logger: LoggerInstance;
  errorCapture: IErrorCapture;
  streamPublisher: RedisStreamPublisher;
  accountRepository: AccountRepository;
  orderRepository: OrderRepository;
  jobRepository: JobRepository;
  accountService: AccountService;
  tokenManager: TokenManager;
  brokerFactory: BrokerAdapterFactory;
  pipelineExecutor: PipelineOrderExecutorService;
  jobManager: JobManager<Container>;
  jobService: JobService<Container>;
  /**
   * Redis instance for caching (balance, price)
   * Shared across all services that need caching
   */
  redis: Redis;
}
