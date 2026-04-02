import * as Sentry from '@sentry/node';
import { nodeProfilingIntegration } from '@sentry/profiling-node';

/**
 * Initialize Sentry for trade-manager
 * Only enabled in production environment
 *
 * IMPORTANT: This file must NOT import config or any other modules
 * that might execute code before Sentry is initialized.
 * Read directly from process.env instead.
 */
export function initSentry(): void {
  const dsn = process.env.SENTRY_DSN;
  const environment = process.env.NODE_ENV || 'development';
  const appName = process.env.APP_NAME || 'trade-manager';

  if (!dsn) {
    return;
  }

  Sentry.init({
    dsn,
    environment,

    // Only enable in production
    enabled: environment === 'production',
    enableLogs: environment === 'production',
    enableMetrics: environment === 'production',

    // Integrations for error tracking and profiling
    integrations: [
      // Capture Pino logs and send to Sentry
      Sentry.pinoIntegration({
        // Send info, warn, error logs to Sentry
        log: {
          levels: ['info', 'warn', 'error'],
        },
        // Also capture warn and error as Sentry errors (not just logs)
        error: {
          levels: ['warn', 'error'],
        },
      }),
      // Enable profiling for performance monitoring
      nodeProfilingIntegration(),
    ],

    // Traces sampling (50% in production)
    tracesSampleRate: environment === 'production' ? 0.5 : 0.0,
  });

  Sentry.setTag('service', appName);
}

export { Sentry };
