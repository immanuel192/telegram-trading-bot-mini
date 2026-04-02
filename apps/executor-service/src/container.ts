/**
 * Purpose: Dependency injection container for executor-service.
 * Exports: createContainer function to wire up all dependencies.
 * Core Flow: Initialize all services → Wire dependencies → Return container.
 */

import {
  AccountRepository,
  executorServiceJobRepository,
  orderRepository,
} from '@dal';
import {
  RedisStreamPublisher,
  JobService,
} from '@telegram-trading-bot-mini/shared/utils';
import { Redis } from 'ioredis';

import { JobManager } from './jobs';

import { config } from './config';
import { logger } from './logger';
import { Sentry } from './sentry';
import { Container } from './interfaces';
import { BrokerAdapterFactory } from './adapters/factory';
import { TokenManager } from './services/token-manager.service';
import { AccountService } from './services/account.service';
import { PipelineOrderExecutorService } from './services/order-handlers/pipeline-executor.service';

/**
 * Create and initialize the dependency injection container
 * Wires up all service dependencies for executor-service
 */
export async function createContainer(): Promise<Container> {
  logger.info('Initializing container...');

  // Initialize repositories
  const accountRepository = new AccountRepository();

  // Initialize Redis for caching
  const redis = new Redis(config('REDIS_URL'));

  // Initialize Redis Stream publisher
  const streamPublisher = new RedisStreamPublisher({
    url: config('REDIS_URL'),
    logger,
  });

  // Initialize token manager
  const tokenManager = new TokenManager(accountRepository, logger, Sentry);

  // Initialize account service with caching
  const accountService = new AccountService(
    accountRepository,
    config('ACCOUNT_CACHE_TTL_MS'),
    logger,
  );

  // Initialize broker adapter factory
  const brokerFactory = new BrokerAdapterFactory(
    accountRepository,
    tokenManager,
    logger,
  );

  // Create container with all dependencies
  let container: Container = {
    logger,
    errorCapture: Sentry,
    streamPublisher,
    redis,
    accountRepository,
    orderRepository,
    jobRepository: executorServiceJobRepository,
    accountService,
    tokenManager,
    brokerFactory,
    // orderExecutor,
    // jobManager,
    // jobService,
  } as Partial<Container> as any;

  // Initialize job system
  const jobManager = new JobManager<Container>(
    executorServiceJobRepository,
    logger,
    container,
  );
  const jobService = new JobService<Container>(jobManager, logger);

  // Initialize new Pipeline Order Executor Service
  const pipelineExecutor = new PipelineOrderExecutorService(container);

  // Correctly populate the container object to maintain references
  Object.assign(container, {
    jobManager,
    jobService,
    pipelineExecutor,
  });

  logger.info('Container initialized successfully');

  return container;
}
