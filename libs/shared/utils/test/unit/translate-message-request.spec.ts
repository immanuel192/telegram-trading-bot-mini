/**
 * Unit tests for TRANSLATE_MESSAGE_REQUEST validation
 *
 * Note: Orders are NOT included in this payload.
 * interpret-service fetches fresh orders from the database at translation time.
 */

import { MessageValidator } from '../../src/stream/validators/message-validator';
import { StreamMessage } from '../../src/stream/stream-interfaces';
import { MessageType } from '../../src/interfaces/messages/message-type';

describe('TRANSLATE_MESSAGE_REQUEST validation', () => {
  let validator: MessageValidator;

  beforeEach(() => {
    validator = new MessageValidator();
  });

  describe('valid payloads', () => {
    it('should validate a correct TRANSLATE_MESSAGE_REQUEST', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          exp: Date.now() + 10000,
          receivedAt: Date.now(),
          messageId: 12345,
          channelId: '-1001234567890',
          messageText: 'Buy EURUSD at 1.0850',
          prevMessage: 'Previous message context',
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate TRANSLATE_MESSAGE_REQUEST with optional fields', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          exp: Date.now() + 10000,
          receivedAt: Date.now(),
          messageId: 45678,
          channelId: '-1001234567890',
          messageText: 'Close position',
          prevMessage: 'Previous message',
          quotedMessage: 'Quoted message text',
          quotedFirstMessage: 'First quoted message',
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate TRANSLATE_MESSAGE_REQUEST with empty prevMessage', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          exp: Date.now() + 10000,
          receivedAt: Date.now(),
          messageId: 78901,
          channelId: '-1001234567890',
          messageText: 'LONG XAUUSD',
          prevMessage: '',
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });
  });

  describe('missing required fields', () => {
    it('should reject TRANSLATE_MESSAGE_REQUEST with missing promptId', async () => {
      const message = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          traceToken: 'trace-test',
          exp: Date.now() + 10000,
          receivedAt: Date.now(),
          messageId: 12345,
          channelId: '-1001234567890',
          messageText: 'Buy EURUSD',
          prevMessage: 'Prev',
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject TRANSLATE_MESSAGE_REQUEST with missing exp', async () => {
      const message = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          receivedAt: Date.now(),
          messageId: 12345,
          channelId: '-1001234567890',
          messageText: 'Buy EURUSD',
          prevMessage: 'Prev',
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject TRANSLATE_MESSAGE_REQUEST with missing messageId', async () => {
      const message = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          exp: Date.now() + 10000,
          receivedAt: Date.now(),
          channelId: '-1001234567890',
          messageText: 'Buy EURUSD',
          prevMessage: 'Prev',
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject TRANSLATE_MESSAGE_REQUEST with missing channelId', async () => {
      const message = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          exp: Date.now() + 10000,
          receivedAt: Date.now(),
          messageId: 12345,
          messageText: 'Buy EURUSD',
          prevMessage: 'Prev',
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject TRANSLATE_MESSAGE_REQUEST with missing messageText', async () => {
      const message = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          exp: Date.now() + 10000,
          receivedAt: Date.now(),
          messageId: 12345,
          channelId: '-1001234567890',
          prevMessage: 'Prev',
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject TRANSLATE_MESSAGE_REQUEST with missing prevMessage', async () => {
      const message = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          exp: Date.now() + 10000,
          receivedAt: Date.now(),
          messageId: 12345,
          channelId: '-1001234567890',
          messageText: 'Buy EURUSD',
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('invalid field types', () => {
    it('should reject TRANSLATE_MESSAGE_REQUEST with invalid exp (negative)', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          exp: -1000,
          receivedAt: Date.now(),
          messageId: 12345,
          channelId: '-1001234567890',
          messageText: 'Buy EURUSD',
          prevMessage: 'Prev',
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject TRANSLATE_MESSAGE_REQUEST with invalid exp (zero)', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          exp: 0,
          receivedAt: Date.now(),
          messageId: 12345,
          channelId: '-1001234567890',
          messageText: 'Buy EURUSD',
          prevMessage: 'Prev',
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject TRANSLATE_MESSAGE_REQUEST with empty messageId', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          exp: Date.now() + 10000,
          receivedAt: Date.now(),
          messageId: 0,
          channelId: '-1001234567890',
          messageText: 'Buy EURUSD',
          prevMessage: 'Prev',
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject TRANSLATE_MESSAGE_REQUEST with empty channelId', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          exp: Date.now() + 10000,
          receivedAt: Date.now(),
          messageId: 12345,
          channelId: '',
          messageText: 'Buy EURUSD',
          prevMessage: 'Prev',
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject TRANSLATE_MESSAGE_REQUEST with empty messageText', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          exp: Date.now() + 10000,
          receivedAt: Date.now(),
          messageId: 12345,
          channelId: '-1001234567890',
          messageText: '',
          prevMessage: 'Prev',
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject TRANSLATE_MESSAGE_REQUEST with empty promptId', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          promptId: '',
          traceToken: 'trace-test',
          exp: Date.now() + 10000,
          receivedAt: Date.now(),
          messageId: 12345,
          channelId: '-1001234567890',
          messageText: 'Buy EURUSD',
          prevMessage: 'Prev',
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });
});
