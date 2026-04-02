/**
 * Unit tests for SYMBOL_FETCH_LATEST_PRICE validation
 */

import { MessageValidator } from '../../src/stream/validators/message-validator';
import { StreamMessage } from '../../src/stream/stream-interfaces';
import { MessageType } from '../../src/interfaces/messages/message-type';

describe('SYMBOL_FETCH_LATEST_PRICE validation', () => {
  let validator: MessageValidator;

  beforeEach(() => {
    validator = new MessageValidator();
  });

  describe('valid payloads', () => {
    it('should validate a correct SYMBOL_FETCH_LATEST_PRICE', async () => {
      const message: StreamMessage<MessageType.SYMBOL_FETCH_LATEST_PRICE> = {
        version: '1.0',
        type: MessageType.SYMBOL_FETCH_LATEST_PRICE,
        payload: {
          symbol: 'EURUSD',
          messageId: 12345,
          channelId: '-1001234567890',
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate SYMBOL_FETCH_LATEST_PRICE with different symbol', async () => {
      const message: StreamMessage<MessageType.SYMBOL_FETCH_LATEST_PRICE> = {
        version: '1.0',
        type: MessageType.SYMBOL_FETCH_LATEST_PRICE,
        payload: {
          symbol: 'XAUUSD',
          messageId: 45678,
          channelId: '-1001234567890',
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate SYMBOL_FETCH_LATEST_PRICE with GBPUSD symbol', async () => {
      const message: StreamMessage<MessageType.SYMBOL_FETCH_LATEST_PRICE> = {
        version: '1.0',
        type: MessageType.SYMBOL_FETCH_LATEST_PRICE,
        payload: {
          symbol: 'GBPUSD',
          messageId: 78901,
          channelId: '-1001234567890',
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });
  });

  describe('missing required fields', () => {
    it('should reject SYMBOL_FETCH_LATEST_PRICE with missing symbol', async () => {
      const message = {
        version: '1.0',
        type: MessageType.SYMBOL_FETCH_LATEST_PRICE,
        payload: {
          messageId: 12345,
          channelId: '-1001234567890',
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject SYMBOL_FETCH_LATEST_PRICE with missing messageId', async () => {
      const message = {
        version: '1.0',
        type: MessageType.SYMBOL_FETCH_LATEST_PRICE,
        payload: {
          symbol: 'EURUSD',
          channelId: '-1001234567890',
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject SYMBOL_FETCH_LATEST_PRICE with missing channelId', async () => {
      const message = {
        version: '1.0',
        type: MessageType.SYMBOL_FETCH_LATEST_PRICE,
        payload: {
          symbol: 'EURUSD',
          messageId: 12345,
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject SYMBOL_FETCH_LATEST_PRICE with all fields missing', async () => {
      const message = {
        version: '1.0',
        type: MessageType.SYMBOL_FETCH_LATEST_PRICE,
        payload: {},
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('invalid field types', () => {
    it('should reject SYMBOL_FETCH_LATEST_PRICE with empty symbol', async () => {
      const message: StreamMessage<MessageType.SYMBOL_FETCH_LATEST_PRICE> = {
        version: '1.0',
        type: MessageType.SYMBOL_FETCH_LATEST_PRICE,
        payload: {
          symbol: '',
          messageId: 12345,
          channelId: '-1001234567890',
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject SYMBOL_FETCH_LATEST_PRICE with empty messageId', async () => {
      const message: StreamMessage<MessageType.SYMBOL_FETCH_LATEST_PRICE> = {
        version: '1.0',
        type: MessageType.SYMBOL_FETCH_LATEST_PRICE,
        payload: {
          symbol: 'EURUSD',
          messageId: 0,
          channelId: '-1001234567890',
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject SYMBOL_FETCH_LATEST_PRICE with empty channelId', async () => {
      const message: StreamMessage<MessageType.SYMBOL_FETCH_LATEST_PRICE> = {
        version: '1.0',
        type: MessageType.SYMBOL_FETCH_LATEST_PRICE,
        payload: {
          symbol: 'EURUSD',
          messageId: 12345,
          channelId: '',
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject SYMBOL_FETCH_LATEST_PRICE with non-string symbol', async () => {
      const message = {
        version: '1.0',
        type: MessageType.SYMBOL_FETCH_LATEST_PRICE,
        payload: {
          symbol: 123,
          messageId: 12345,
          channelId: '-1001234567890',
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject SYMBOL_FETCH_LATEST_PRICE with non-number messageId', async () => {
      const message = {
        version: '1.0',
        type: MessageType.SYMBOL_FETCH_LATEST_PRICE,
        payload: {
          symbol: 'EURUSD',
          messageId: '123', // String instead of number
          channelId: '-1001234567890',
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject SYMBOL_FETCH_LATEST_PRICE with non-string channelId', async () => {
      const message = {
        version: '1.0',
        type: MessageType.SYMBOL_FETCH_LATEST_PRICE,
        payload: {
          symbol: 'EURUSD',
          messageId: 12345,
          channelId: 123,
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
