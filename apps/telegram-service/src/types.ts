/**
 * Configuration interface for Telegram client using mtcute.
 * Defines the required fields for authenticating and connecting to Telegram.
 */
export interface TelegramConfig {
  /**
   * Telegram API ID obtained from https://my.telegram.org
   */
  apiId: number;

  /**
   * Telegram API Hash obtained from https://my.telegram.org
   */
  apiHash: string;

  /**
   * Session string for persistent authentication.
   * Can be loaded from environment variable for local dev,
   * but database takes precedence in production.
   */
  /**
   * Session string for persistent authentication.
   * Can be loaded from environment variable for local dev,
   * but database takes precedence in production.
   */
  session?: string;
}

/**
 * Converts environment-based config to TelegramConfig interface.
 * Parses TELEGRAM_API_ID to number.
 */
export function parseTelegramConfig(envConfig: {
  TELEGRAM_API_ID: string;
  TELEGRAM_API_HASH: string;
  TELEGRAM_SESSION?: string;
}): TelegramConfig {
  return {
    apiId: parseInt(envConfig.TELEGRAM_API_ID, 10),
    apiHash: envConfig.TELEGRAM_API_HASH,
    session: envConfig.TELEGRAM_SESSION || undefined,
  };
}
