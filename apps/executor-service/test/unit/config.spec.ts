/**
 * Unit tests for executor-service configuration
 */

import { config } from '../../src/config';

describe('ExecutorConfig', () => {
  it('should load config with defaults', () => {
    expect(config('APP_NAME')).toBe('executor-service');
    expect(config('PRICE_FEED_INTERVAL_MS')).toBe(5000);
    expect(config('PRICE_FEED_BATCH_SIZE')).toBe(10);
    expect(config('ORDER_EXECUTION_TIMEOUT_MS')).toBe(30000);
    expect(config('ORDER_RETRY_MAX_ATTEMPTS')).toBe(3);
  });

  it('should have required base config fields', () => {
    expect(config('LOG_LEVEL')).toBe('info');
    expect(config('NODE_ENV')).toBe('test'); // NODE_ENV is 'test' during testing
    expect(config('MONGODB_URI')).toBeDefined();
    expect(config('MONGODB_DBNAME')).toBe('telegram-trading-bot');
  });

  it('should have Redis configuration', () => {
    expect(config('REDIS_URL')).toBeDefined();
  });
});
