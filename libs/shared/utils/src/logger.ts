import pino from 'pino';
import { Config, BaseConfig, LoggerInstance } from './interfaces';

// Get version from root package.json
let version = '0.0.1';
try {
  const packageJson = require('../../../package.json');
  version = packageJson.version || '0.0.1';
} catch {
  // Fallback if package.json not found
}

/**
 * Do not use this default logger unless you have no other options. Prefer to use logger instance
 */
export const defaultLogger = pino({});

/**
 * Create a logger with custom app name
 * Useful for apps that want to override the app name
 */
export function createLogger(
  appName: string,
  config: Config<BaseConfig>
): LoggerInstance {
  const env = config('NODE_ENV') || 'development';
  const isProduction = env === 'production';
  const logLevel = config('LOG_LEVEL') || 'info';

  let appLogger: LoggerInstance;

  if (isProduction) {
    // Production: Simple logger to stdout (PM2 will capture)
    // Sentry integration is handled separately via Sentry.captureException()
    appLogger = pino({
      level: logLevel,
      name: appName,
      base: {
        ver: version,
        env,
      },
    });
  } else {
    appLogger = pino({
      level: logLevel,
      name: appName,
      base: {
        ver: version,
        env,
      },
      transport: {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      },
    });
  }

  return appLogger;
}
