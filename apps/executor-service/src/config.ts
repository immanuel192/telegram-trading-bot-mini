/**
 * Purpose: Configuration for executor-service extending BaseConfig.
 * Exports: ExecutorConfig interface and config function.
 * Core Flow: Loads environment variables with defaults → Provides type-safe config access.
 */

import {
  createConfig,
  BaseConfig,
  StreamConsumerMode,
} from '@telegram-trading-bot-mini/shared/utils';

export interface ExecutorConfig extends BaseConfig {
  // Redis Stream configuration (native Redis)
  REDIS_URL: string;
  // Stream consumer configuration
  STREAM_CONSUMER_MODE_ORDER_EXECUTION_REQUESTS: StreamConsumerMode;
  // Price feed configuration
  PRICE_FEED_INTERVAL_MS: number;
  PRICE_FEED_BATCH_SIZE: number;
  // Order execution configuration
  ORDER_EXECUTION_TIMEOUT_MS: number;
  ORDER_RETRY_MAX_ATTEMPTS: number;
  // Account cache configuration
  ACCOUNT_CACHE_TTL_MS: number;
  /**
   * Balance cache TTL in seconds
   * How long cached balance data is considered fresh
   * Default: 1800 (30 minutes)
   */
  BALANCE_CACHE_TTL_SECONDS: number;
  /**
   * Price cache TTL in seconds
   * How long cached price data is considered fresh
   * Default: 32 (2x update frequency at 15s intervals)
   */
  PRICE_CACHE_TTL_SECONDS: number;
  // Sentry configuration
  SENTRY_DSN: string;
}

const defaultConfig: Record<keyof ExecutorConfig, any> = {
  APP_NAME: 'executor-service',
  LOG_LEVEL: 'info',
  NODE_ENV: 'development',
  MONGODB_URI:
    'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true',
  MONGODB_DBNAME: 'telegram-trading-bot',
  // Redis Stream configuration (native Redis for development)
  REDIS_URL: 'redis://localhost:6379',
  // Stream consumer configuration
  STREAM_CONSUMER_MODE_ORDER_EXECUTION_REQUESTS: StreamConsumerMode.NEW,
  // Price feed configuration
  PRICE_FEED_INTERVAL_MS: 5000,
  PRICE_FEED_BATCH_SIZE: 10,
  // Order execution configuration
  ORDER_EXECUTION_TIMEOUT_MS: 30000,
  ORDER_RETRY_MAX_ATTEMPTS: 3,
  // Account cache configuration (5 minutes)
  ACCOUNT_CACHE_TTL_MS: 300000,
  // Balance cache TTL (30 minutes)
  BALANCE_CACHE_TTL_SECONDS: 1800,
  // Price cache TTL (32 seconds - 2x update frequency)
  PRICE_CACHE_TTL_SECONDS: 32,
  // Sentry DSN for development
  SENTRY_DSN: 'your-sentry-dsn',
};

export const config = createConfig<ExecutorConfig>(defaultConfig);
