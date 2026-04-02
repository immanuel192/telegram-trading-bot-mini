import {
  createConfig,
  BaseConfig,
  StreamConsumerMode,
} from '@telegram-trading-bot-mini/shared/utils';

export interface TradeManagerConfig extends BaseConfig {
  PORT: number;
  // Sentry configuration
  SENTRY_DSN: string;
  // Redis Stream configuration (native Redis)
  REDIS_URL: string;
  // Stream consumer configuration - per stream
  STREAM_CONSUMER_MODE_MESSAGES: StreamConsumerMode;
  /** Consumer mode for TRANSLATE_RESULTS stream - controls whether to replay all results or only new ones */
  STREAM_CONSUMER_MODE_TRANSLATE_RESULTS: StreamConsumerMode;
  /** Consumer mode for PRICE_UPDATES stream */
  STREAM_CONSUMER_MODE_PRICE_UPDATES: StreamConsumerMode;
  // PushSafer API configuration
  PUSHSAFER_API_KEY: string;
  // Message history TTL in seconds (matches telegram-service pattern)
  MESSAGE_HISTORY_TTL_SECONDS: number;
  /**
   * Price cache TTL in seconds
   * How long cached price data is considered fresh
   * Default: 32 (2x update frequency at 15s intervals)
   */
  PRICE_CACHE_TTL_SECONDS: number;
}

const defaultConfig: Record<keyof TradeManagerConfig, any> = {
  APP_NAME: 'trade-manager',
  LOG_LEVEL: 'info',
  NODE_ENV: 'development',
  MONGODB_URI:
    'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true',
  MONGODB_DBNAME: 'telegram-trading-bot',
  PORT: 9003,
  // Sentry DSN for error tracking
  SENTRY_DSN: 'https://placeholder-dsn@sentry.io/project-id',
  // Redis Stream configuration (native Redis for development)
  REDIS_URL: 'redis://localhost:6379',
  // Stream consumer configuration - per stream
  STREAM_CONSUMER_MODE_MESSAGES: StreamConsumerMode.NEW,
  STREAM_CONSUMER_MODE_TRANSLATE_RESULTS: StreamConsumerMode.NEW,
  STREAM_CONSUMER_MODE_PRICE_UPDATES: StreamConsumerMode.NEW,
  // Push notification configuration
  PUSHSAFER_API_KEY: '',
  // Message history TTL in seconds (matches telegram-service pattern)
  MESSAGE_HISTORY_TTL_SECONDS: 10,
  // Price cache TTL (32 seconds - 2x update frequency)
  PRICE_CACHE_TTL_SECONDS: 32,
};

export const config = createConfig<TradeManagerConfig>(defaultConfig);
