/**
 * Custom error for when Telegram session is not found
 */
export class TelegramSessionNotFoundError extends Error {
  constructor(
    message = 'Telegram session not found. Please run the capture-session script and save the session to the database.'
  ) {
    super(message);
    this.name = 'TelegramSessionNotFoundError';
    Error.captureStackTrace(this, this.constructor);
  }
}
