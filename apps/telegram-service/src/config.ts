import {
  BaseConfig,
  createConfig,
  ConfigYesNo,
} from '@telegram-trading-bot-mini/shared/utils';

export interface TelegramServiceConfig extends BaseConfig {
  PORT: number;
  // Telegram configuration
  TELEGRAM_API_ID: string;
  TELEGRAM_API_HASH: string;
  TELEGRAM_SESSION: string;
  SENTRY_DSN: string;
  // Redis Stream configuration (native Redis)
  REDIS_URL: string;
  //
  // stream message ttl, in ms
  STREAM_MESSAGE_TTL_IN_SEC: string;
  /**
   * PushSafer API key for sending push notifications
   * Get your API key from https://www.pushsafer.com/
   */
  PUSHSAFER_API_KEY: string;
  /**
   * Enable push notifications when media is detected in Telegram messages
   * When enabled, sends an alert via PushSafer whenever a message contains media
   * Default: 'yes'
   */
  NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA: ConfigYesNo;
}

const defaultConfig: Record<keyof TelegramServiceConfig, any> = {
  APP_NAME: 'telegram-service',
  LOG_LEVEL: 'info',
  NODE_ENV: 'development',
  MONGODB_URI:
    'mongodb://localhost:27017/?replicaSet=rs0&directConnection=true',
  MONGODB_DBNAME: 'telegram-trading-bot',
  PORT: 9001,
  TELEGRAM_API_ID: '',
  TELEGRAM_API_HASH: '',
  TELEGRAM_SESSION: '',
  // Sentry DSN for error tracking
  SENTRY_DSN: 'https://placeholder-dsn@sentry.io/project-id',
  // Redis Stream configuration (native Redis for development)
  REDIS_URL: 'redis://localhost:6379',
  //
  STREAM_MESSAGE_TTL_IN_SEC: 10,
  // Push notification configuration
  PUSHSAFER_API_KEY: '',
  NOTIFICATION_ALERT_WHEN_TELEGRAM_MESSAGE_HAS_MEDIA: ConfigYesNo.YES,
};

export const config = createConfig<TelegramServiceConfig>(defaultConfig);
