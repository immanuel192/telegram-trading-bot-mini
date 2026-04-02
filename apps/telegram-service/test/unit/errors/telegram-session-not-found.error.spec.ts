/**
 * Unit tests for TelegramSessionNotFoundError
 */

import { suiteName } from '@telegram-trading-bot-mini/shared/test-utils';
import { TelegramSessionNotFoundError } from '../../../src/errors/telegram-session-not-found.error';

describe(suiteName(__filename), () => {
  describe('TelegramSessionNotFoundError', () => {
    it('should create error with default message', () => {
      const error = new TelegramSessionNotFoundError();

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TelegramSessionNotFoundError);
      expect(error.name).toBe('TelegramSessionNotFoundError');
      expect(error.message).toBe(
        'Telegram session not found. Please run the capture-session script and save the session to the database.',
      );
    });

    it('should create error with custom message', () => {
      const customMessage = 'Custom error message for testing';
      const error = new TelegramSessionNotFoundError(customMessage);

      expect(error).toBeInstanceOf(Error);
      expect(error).toBeInstanceOf(TelegramSessionNotFoundError);
      expect(error.name).toBe('TelegramSessionNotFoundError');
      expect(error.message).toBe(customMessage);
    });

    it('should have stack trace', () => {
      const error = new TelegramSessionNotFoundError();

      expect(error.stack).toBeDefined();
      expect(error.stack).toContain('TelegramSessionNotFoundError');
    });

    it('should be throwable and catchable', () => {
      expect(() => {
        throw new TelegramSessionNotFoundError();
      }).toThrow(TelegramSessionNotFoundError);

      expect(() => {
        throw new TelegramSessionNotFoundError('Custom message');
      }).toThrow('Custom message');
    });

    it('should be distinguishable from generic Error', () => {
      const error = new TelegramSessionNotFoundError();
      const genericError = new Error('Generic error');

      expect(error instanceof TelegramSessionNotFoundError).toBe(true);
      expect(genericError instanceof TelegramSessionNotFoundError).toBe(false);
    });

    it('should work in try-catch blocks', () => {
      try {
        throw new TelegramSessionNotFoundError('Test error');
      } catch (error) {
        expect(error).toBeInstanceOf(TelegramSessionNotFoundError);
        expect((error as TelegramSessionNotFoundError).message).toBe(
          'Test error',
        );
      }
    });

    it('should have correct prototype chain', () => {
      const error = new TelegramSessionNotFoundError();

      expect(Object.getPrototypeOf(error)).toBe(
        TelegramSessionNotFoundError.prototype,
      );
      expect(Object.getPrototypeOf(Object.getPrototypeOf(error))).toBe(
        Error.prototype,
      );
    });
  });
});
