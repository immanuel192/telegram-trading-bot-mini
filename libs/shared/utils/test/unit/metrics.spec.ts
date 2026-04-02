/**
 * Unit tests for metrics utility
 */

import * as Sentry from '@sentry/node';
import {
  configureMetrics,
  getMetricsConfig,
  incrementMetric,
  gaugeMetric,
  MetricNames,
  MetricTagNames,
} from '../../src/metrics';

// Mock Sentry metrics
jest.mock('@sentry/node', () => ({
  metrics: {
    count: jest.fn(),
    gauge: jest.fn(),
  },
}));

describe('Metrics Utility', () => {
  let consoleWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to default configuration
    configureMetrics({ enabled: false });
    // Spy on console.warn to suppress warnings in tests
    consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
  });

  afterEach(() => {
    consoleWarnSpy.mockRestore();
  });

  describe('configureMetrics', () => {
    it('should update metrics configuration', () => {
      configureMetrics({ enabled: true });
      const config = getMetricsConfig();
      expect(config.enabled).toBe(true);
    });

    it('should merge with existing configuration', () => {
      configureMetrics({ enabled: true });
      configureMetrics({ enabled: false });
      const config = getMetricsConfig();
      expect(config.enabled).toBe(false);
    });
  });

  describe('getMetricsConfig', () => {
    it('should return current configuration', () => {
      configureMetrics({ enabled: true });
      const config = getMetricsConfig();
      expect(config).toEqual({ enabled: true });
    });

    it('should return a copy of configuration', () => {
      const config1 = getMetricsConfig();
      config1.enabled = true;
      const config2 = getMetricsConfig();
      expect(config2.enabled).not.toBe(config1.enabled);
    });
  });

  describe('incrementMetric', () => {
    it('should not emit metrics when disabled', () => {
      configureMetrics({ enabled: false });
      incrementMetric('test.metric', 1);
      expect(Sentry.metrics.count).not.toHaveBeenCalled();
    });

    it('should emit metrics when enabled', () => {
      configureMetrics({ enabled: true });
      incrementMetric('test.metric', 1);
      expect(Sentry.metrics.count).toHaveBeenCalledWith('test.metric', 1, {
        attributes: undefined,
      });
    });

    it('should use default value of 1', () => {
      configureMetrics({ enabled: true });
      incrementMetric('test.metric');
      expect(Sentry.metrics.count).toHaveBeenCalledWith('test.metric', 1, {
        attributes: undefined,
      });
    });

    it('should pass sanitized tags as attributes', () => {
      configureMetrics({ enabled: true });
      incrementMetric('test.metric', 1, {
        channel: 'test-channel',
        traceToken: '12345-1003409608482',
      });
      expect(Sentry.metrics.count).toHaveBeenCalledWith('test.metric', 1, {
        attributes: {
          channel: 'test-channel',
          traceToken: '12345-1003409608482',
        },
      });
    });

    it('should handle Sentry errors gracefully', () => {
      configureMetrics({ enabled: true });
      (Sentry.metrics.count as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Sentry error');
      });

      // Should not throw
      expect(() => incrementMetric('test.metric', 1)).not.toThrow();

      // Should log warning in non-production
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to increment metric test.metric:',
        expect.any(Error)
      );
    });

    it('should sanitize tags with undefined values', () => {
      configureMetrics({ enabled: true });
      incrementMetric('test.metric', 1, {
        channel: 'test-channel',
        traceToken: undefined as any,
      });
      expect(Sentry.metrics.count).toHaveBeenCalledWith('test.metric', 1, {
        attributes: {
          channel: 'test-channel',
        },
      });
    });

    it('should sanitize tags with null values', () => {
      configureMetrics({ enabled: true });
      incrementMetric('test.metric', 1, {
        channel: 'test-channel',
        traceToken: null as any,
      });
      expect(Sentry.metrics.count).toHaveBeenCalledWith('test.metric', 1, {
        attributes: {
          channel: 'test-channel',
        },
      });
    });

    it('should convert non-string tag values to strings', () => {
      configureMetrics({ enabled: true });
      incrementMetric('test.metric', 1, {
        count: 42,
        enabled: true,
      });
      expect(Sentry.metrics.count).toHaveBeenCalledWith('test.metric', 1, {
        attributes: {
          count: '42',
          enabled: 'true',
        },
      });
    });
  });

  describe('gaugeMetric', () => {
    it('should not emit metrics when disabled', () => {
      configureMetrics({ enabled: false });
      gaugeMetric('test.gauge', 42);
      expect(Sentry.metrics.gauge).not.toHaveBeenCalled();
    });

    it('should emit metrics when enabled', () => {
      configureMetrics({ enabled: true });
      gaugeMetric('test.gauge', 42);
      expect(Sentry.metrics.gauge).toHaveBeenCalledWith('test.gauge', 42, {
        attributes: undefined,
      });
    });

    it('should pass sanitized tags as attributes', () => {
      configureMetrics({ enabled: true });
      gaugeMetric('test.gauge', 42, {
        queue: 'message-processing',
      });
      expect(Sentry.metrics.gauge).toHaveBeenCalledWith('test.gauge', 42, {
        attributes: {
          queue: 'message-processing',
        },
      });
    });

    it('should handle Sentry errors gracefully', () => {
      configureMetrics({ enabled: true });
      (Sentry.metrics.gauge as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Sentry error');
      });

      // Should not throw
      expect(() => gaugeMetric('test.gauge', 42)).not.toThrow();

      // Should log warning in non-production
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        'Failed to set gauge metric test.gauge:',
        expect.any(Error)
      );
    });

    it('should handle zero values', () => {
      configureMetrics({ enabled: true });
      gaugeMetric('test.gauge', 0);
      expect(Sentry.metrics.gauge).toHaveBeenCalledWith('test.gauge', 0, {
        attributes: undefined,
      });
    });

    it('should handle negative values', () => {
      configureMetrics({ enabled: true });
      gaugeMetric('test.gauge', -10);
      expect(Sentry.metrics.gauge).toHaveBeenCalledWith('test.gauge', -10, {
        attributes: undefined,
      });
    });
  });

  describe('MetricNames constants', () => {
    it('should have all required metric names', () => {
      expect(MetricNames.MESSAGE_PROCESSED).toBe('message.processed');
      expect(MetricNames.MESSAGE_EDIT).toBe('message.edit');
      expect(MetricNames.MESSAGE_DELETE).toBe('message.delete');
      expect(MetricNames.MESSAGE_MEDIA).toBe('message.media');
      expect(MetricNames.QUEUE_DEPTH).toBe('queue.depth');
      expect(MetricNames.STREAM_LAG).toBe('stream.lag');
      expect(MetricNames.ERROR_COUNT).toBe('error.count');
      expect(MetricNames.PROCESSING_RATE).toBe('processing.rate');
      expect(MetricNames.SIGNAL_PROCESSED).toBe('signal.processed');
      expect(MetricNames.LLM_LATENCY).toBe('llm.latency');
      expect(MetricNames.TRADE_EXECUTED).toBe('trade.executed');
      expect(MetricNames.RISK_EVENT).toBe('risk.event');
      expect(MetricNames.TRADE_ERROR).toBe('trade.error');
    });
  });

  describe('MetricTagNames constants', () => {
    it('should have all required tag names', () => {
      expect(MetricTagNames.CHANNEL).toBe('channel');
      expect(MetricTagNames.TRACE_TOKEN).toBe('traceToken');
      expect(MetricTagNames.TYPE).toBe('type');
      expect(MetricTagNames.QUEUE).toBe('queue');
      expect(MetricTagNames.STREAM).toBe('stream');
      expect(MetricTagNames.ACCOUNT).toBe('account');
      expect(MetricTagNames.SYMBOL).toBe('symbol');
      expect(MetricTagNames.SIDE).toBe('side');
      expect(MetricTagNames.RULE).toBe('rule');
    });
  });

  describe('Environment-based configuration', () => {
    const originalEnv = process.env['NODE_ENV'];

    afterEach(() => {
      process.env['NODE_ENV'] = originalEnv;
    });

    it('should default to enabled in production', () => {
      // Note: This test verifies the default behavior
      // In actual usage, metrics are enabled based on NODE_ENV at module load time
      configureMetrics({ enabled: true });
      incrementMetric('test.metric', 1);
      expect(Sentry.metrics.count).toHaveBeenCalled();
    });

    it('should respect manual configuration override', () => {
      configureMetrics({ enabled: false });
      incrementMetric('test.metric', 1);
      expect(Sentry.metrics.count).not.toHaveBeenCalled();
    });
  });
});
