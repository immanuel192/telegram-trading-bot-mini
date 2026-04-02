import { config } from '../../src/config';

describe('Config', () => {
  it('should have default configuration values', () => {
    expect(config('APP_NAME')).toBe('interpret-service');
    expect(config('NODE_ENV')).not.toBeFalsy();
    expect(config('PORT')).toBe(9002);
    expect(config('LOG_LEVEL')).toBe('info');
  });

  it('should have MongoDB configuration', () => {
    expect(config('MONGODB_URI')).toMatch(/^mongodb:\/\/.*$/);
  });

  it('should have Sentry configuration', () => {
    expect(config('SENTRY_DSN')).toContain('sentry.io');
  });

  it('should have Redis Stream configuration', () => {
    expect(config('REDIS_URL')).toMatch(/^redis:\/\/.*$/);
  });

  it('should have stream consumer configuration', () => {
    expect(config('STREAM_CONSUMER_MODE_REQUESTS')).toBe('new');
  });

  it('should have PushSafer configuration', () => {
    expect(config('PUSHSAFER_API_KEY')).toBe('fake-pushsafer-key');
  });

  it('should have AI Gemini configuration', () => {
    // expect(config('AI_GEMINI_API_KEY')).toBe(expect.any(String));
    expect(config('AI_GEMINI_MODEL')).toBe('gemini-2.5-flash-lite');
    expect(config('AI_PROMPT_CACHE_TTL_SECONDS')).toBe(1800);
  });

  it('should have all required configuration keys with correct types', () => {
    const stringKeys = [
      'APP_NAME',
      'NODE_ENV',
      'LOG_LEVEL',
      'MONGODB_URI',
      'MONGODB_DBNAME',
      'SENTRY_DSN',
      'REDIS_URL',
      'STREAM_CONSUMER_MODE_REQUESTS',
      'PUSHSAFER_API_KEY',
      'AI_GEMINI_API_KEY',
      'AI_GEMINI_MODEL',
    ] as const;

    const numberKeys = ['PORT', 'AI_PROMPT_CACHE_TTL_SECONDS'] as const;

    // Test string keys
    stringKeys.forEach((key) => {
      expect(config(key)).toBeDefined();
      expect(typeof config(key)).toBe('string');
    });

    // Test number keys
    numberKeys.forEach((key) => {
      expect(config(key)).toBeDefined();
      expect(typeof config(key)).toBe('number');
    });
  });

  it('should have all required AI Gemini configuration keys', () => {
    const requiredGeminiKeys = [
      'AI_GEMINI_API_KEY',
      'AI_GEMINI_MODEL',
    ] as const;

    requiredGeminiKeys.forEach((key) => {
      expect(config(key)).toBeDefined();
      expect(typeof config(key)).toBe('string');
    });

    expect(config('AI_PROMPT_CACHE_TTL_SECONDS')).toBeDefined();
    expect(typeof config('AI_PROMPT_CACHE_TTL_SECONDS')).toBe('number');
  });
});
