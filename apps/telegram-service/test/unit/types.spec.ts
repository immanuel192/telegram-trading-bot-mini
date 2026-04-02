import { parseTelegramConfig } from '../../src/types';

describe('parseTelegramConfig', () => {
  it('should correctly parse valid configuration', () => {
    const envConfig = {
      TELEGRAM_API_ID: '123456',
      TELEGRAM_API_HASH: 'abcdef123456',
      TELEGRAM_SESSION: 'session_string',
    };

    const result = parseTelegramConfig(envConfig);

    expect(result).toEqual({
      apiId: 123456,
      apiHash: 'abcdef123456',
      session: 'session_string',
    });
  });

  it('should handle missing optional session', () => {
    const envConfig = {
      TELEGRAM_API_ID: '123456',
      TELEGRAM_API_HASH: 'abcdef123456',
    };

    const result = parseTelegramConfig(envConfig);

    expect(result).toEqual({
      apiId: 123456,
      apiHash: 'abcdef123456',
      session: undefined,
    });
  });

  it('should handle empty string session as undefined', () => {
    const envConfig = {
      TELEGRAM_API_ID: '123456',
      TELEGRAM_API_HASH: 'abcdef123456',
      TELEGRAM_SESSION: '',
    };

    const result = parseTelegramConfig(envConfig);

    expect(result).toEqual({
      apiId: 123456,
      apiHash: 'abcdef123456',
      session: undefined,
    });
  });
});
