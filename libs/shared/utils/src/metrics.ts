/**
 * Metrics utility for safe Sentry metric emission
 *
 * This module provides wrapper functions for Sentry metrics that:
 * - Handle errors gracefully without affecting business logic
 * - Support environment-based enabling/disabling
 * - Provide type-safe metric names and tags
 *
 * Usage:
 * ```typescript
 * import { incrementMetric, gaugeMetric } from '@shared/utils';
 *
 * incrementMetric('message.processed', 1, {
 *   channel: 'trading-signals',
 *   traceToken: '12345-1003409608482'
 * });
 *
 * gaugeMetric('queue.depth', 42, {
 *   queue: 'message-processing'
 * });
 * ```
 */

import * as Sentry from '@sentry/node';

/**
 * Type-safe metric tags
 * Tags are key-value pairs that provide context for metrics
 */
export type MetricTags = Record<string, string | number | boolean>;

/**
 * Metric configuration
 */
interface MetricConfig {
  /**
   * Whether metrics are enabled
   * Defaults to true in production, false otherwise
   */
  enabled: boolean;
}

let metricsConfig: MetricConfig = {
  enabled: process.env['NODE_ENV'] === 'production',
};

/**
 * Configure metrics behavior
 *
 * @param config - Metric configuration options
 *
 * @example
 * configureMetrics({ enabled: true }); // Force enable metrics
 * configureMetrics({ enabled: false }); // Disable metrics
 */
export function configureMetrics(config: Partial<MetricConfig>): void {
  metricsConfig = { ...metricsConfig, ...config };
}

/**
 * Get current metrics configuration
 *
 * @returns Current metrics configuration
 */
export function getMetricsConfig(): MetricConfig {
  return { ...metricsConfig };
}

/**
 * Safely increment a counter metric
 *
 * This function wraps Sentry.metrics.increment with error handling
 * to ensure metric failures don't affect business logic.
 *
 * @param name - Metric name (e.g., 'message.processed', 'error.count')
 * @param value - Value to increment by (default: 1)
 * @param tags - Optional tags for metric context
 *
 * @example
 * incrementMetric('message.processed', 1, {
 *   channel: 'trading-signals',
 *   traceToken: '12345-1003409608482'
 * });
 */
export function incrementMetric(
  name: string,
  value = 1,
  tags?: MetricTags
): void {
  if (!metricsConfig.enabled) {
    return;
  }

  try {
    Sentry.metrics.count(name, value, {
      attributes: tags ? sanitizeTags(tags) : undefined,
    });
  } catch (error) {
    // Silently fail - metrics should never affect business logic
    // Log to console in development for debugging
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn(`Failed to increment metric ${name}:`, error);
    }
  }
}

/**
 * Safely set a gauge metric
 *
 * This function wraps Sentry.metrics.gauge with error handling
 * to ensure metric failures don't affect business logic.
 *
 * @param name - Metric name (e.g., 'queue.depth', 'stream.lag')
 * @param value - Gauge value
 * @param tags - Optional tags for metric context
 *
 * @example
 * gaugeMetric('queue.depth', 42, {
 *   queue: 'message-processing'
 * });
 *
 * gaugeMetric('stream.lag', 150, {
 *   stream: 'telegram-messages',
 *   traceToken: '12345-1003409608482'
 * });
 */
export function gaugeMetric(
  name: string,
  value: number,
  tags?: MetricTags
): void {
  if (!metricsConfig.enabled) {
    return;
  }

  try {
    Sentry.metrics.gauge(name, value, {
      attributes: tags ? sanitizeTags(tags) : undefined,
    });
  } catch (error) {
    // Silently fail - metrics should never affect business logic
    // Log to console in development for debugging
    if (process.env['NODE_ENV'] !== 'production') {
      console.warn(`Failed to set gauge metric ${name}:`, error);
    }
  }
}

/**
 * Sanitize metric tags to ensure they're valid for Sentry
 *
 * Converts all tag values to strings and removes undefined/null values
 *
 * @param tags - Raw metric tags
 * @returns Sanitized tags
 */
function sanitizeTags(tags: MetricTags): Record<string, string> {
  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(tags)) {
    if (value !== undefined && value !== null) {
      sanitized[key] = String(value);
    }
  }

  return sanitized;
}

/**
 * Common metric names used across services
 * This provides type safety and consistency for metric names
 */
export const MetricNames = {
  // Message processing metrics
  MESSAGE_PROCESSED: 'message.processed',
  MESSAGE_EDIT: 'message.edit',
  MESSAGE_DELETE: 'message.delete',
  MESSAGE_MEDIA: 'message.media',

  // Queue metrics
  QUEUE_DEPTH: 'queue.depth',

  // Stream metrics
  STREAM_LAG: 'stream.lag',

  // Error metrics
  ERROR_COUNT: 'error.count',

  // Processing rate metrics
  PROCESSING_RATE: 'processing.rate',

  // Signal processing metrics (interpret-service)
  SIGNAL_PROCESSED: 'signal.processed',
  LLM_LATENCY: 'llm.latency',

  // Trade execution metrics (trade-manager)
  TRADE_EXECUTED: 'trade.executed',
  RISK_EVENT: 'risk.event',
  TRADE_ERROR: 'trade.error',
} as const;

/**
 * Common metric tag names
 * This provides type safety and consistency for tag names
 */
export const MetricTagNames = {
  CHANNEL: 'channel',
  TRACE_TOKEN: 'traceToken',
  TYPE: 'type',
  QUEUE: 'queue',
  STREAM: 'stream',
  ACCOUNT: 'account',
  SYMBOL: 'symbol',
  SIDE: 'side',
  RULE: 'rule',
} as const;
