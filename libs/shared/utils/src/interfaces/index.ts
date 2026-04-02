export { Logger as LoggerInstance } from 'pino';

// Default config that every app should use. The app will have their own config to override
export interface BaseConfig {
  APP_NAME: string;
  LOG_LEVEL: string;
  NODE_ENV: string;
  // mongodb
  MONGODB_URI: string;
  MONGODB_DBNAME: string;
}

export type Config<T extends BaseConfig> = <K extends keyof T>(name: K) => T[K];

export interface SentryDistributedTracing {
  /**
   * Sentry distributed tracing: W3C trace context header
   * Injected by publishers, consumed by handlers to continue traces
   * @see https://docs.sentry.io/platforms/javascript/performance/instrumentation/custom-instrumentation/#continuing-traces
   */
  _sentryTrace?: string;

  /**
   * Sentry distributed tracing: Baggage header for trace metadata
   * Contains additional trace context (environment, release, etc.)
   * @see https://docs.sentry.io/platforms/javascript/performance/instrumentation/custom-instrumentation/#continuing-traces
   */
  _sentryBaggage?: string;
}

export * from './push-notification.interface';
export * from './messages';
