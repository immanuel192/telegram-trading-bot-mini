/**
 * Unit tests for MessageValidator
 */

import { MessageValidator } from '../../src/stream/validators/message-validator';
import { StreamMessage } from '../../src/stream/stream-interfaces';
import { MessageType } from '../../src/interfaces/messages/message-type';

describe('MessageValidator', () => {
  let validator: MessageValidator;

  beforeEach(() => {
    validator = new MessageValidator();
  });

  describe('validate', () => {
    describe('NEW_MESSAGE validation', () => {
      it('should validate a correct NEW_MESSAGE', async () => {
        const message: StreamMessage<MessageType.NEW_MESSAGE> = {
          version: '1.0',
          type: MessageType.NEW_MESSAGE,
          payload: {
            receivedAt: Date.now(),
            channelCode: 'test-channel',
            channelId: '-1001234567890',
            messageId: 123,
            traceToken: 'trace-123',
            exp: Date.now() + 60000,
          },
        };

        const result = await validator.validate(message);
        expect(result.valid).toBe(true);
      });

      it('should validate NEW_MESSAGE with optional traceToken', async () => {
        const message: StreamMessage<MessageType.NEW_MESSAGE> = {
          version: '1.0',
          type: MessageType.NEW_MESSAGE,
          payload: {
            receivedAt: Date.now(),
            channelCode: 'test-channel',
            channelId: '-1001234567890',
            messageId: 123,
            traceToken: 'test-trace-token',
            exp: Date.now() + 60000,
          },
        };

        const result = await validator.validate(message);
        expect(result.valid).toBe(true);
      });

      it('should reject NEW_MESSAGE with missing channelCode', async () => {
        const message: StreamMessage<MessageType.NEW_MESSAGE> = {
          version: '1.0',
          type: MessageType.NEW_MESSAGE,
          payload: {
            receivedAt: Date.now(),
            channelCode: '',
            channelId: '-1001234567890',
            messageId: 123,
            traceToken: 'trace-123',
            exp: Date.now() + 60000,
          },
        };

        const result = await validator.validate(message);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject NEW_MESSAGE with missing channelId', async () => {
        const message: StreamMessage<MessageType.NEW_MESSAGE> = {
          version: '1.0',
          type: MessageType.NEW_MESSAGE,
          payload: {
            receivedAt: Date.now(),
            channelCode: 'test-channel',
            channelId: '',
            messageId: 123,
            traceToken: 'trace-123',
            exp: Date.now() + 60000,
          },
        };

        const result = await validator.validate(message);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject NEW_MESSAGE with invalid messageId (negative)', async () => {
        const message: StreamMessage<MessageType.NEW_MESSAGE> = {
          version: '1.0',
          type: MessageType.NEW_MESSAGE,
          payload: {
            receivedAt: Date.now(),
            channelCode: 'test-channel',
            channelId: '-1001234567890',
            messageId: -123,
            traceToken: 'trace--123',
            exp: Date.now() + 60000,
          },
        };

        const result = await validator.validate(message);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject NEW_MESSAGE with invalid messageId (zero)', async () => {
        const message: StreamMessage<MessageType.NEW_MESSAGE> = {
          version: '1.0',
          type: MessageType.NEW_MESSAGE,
          payload: {
            receivedAt: Date.now(),
            channelCode: 'test-channel',
            channelId: '-1001234567890',
            messageId: 0,
            traceToken: 'trace-0',
            exp: Date.now() + 60000,
          },
        };

        const result = await validator.validate(message);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject NEW_MESSAGE with invalid exp (negative)', async () => {
        const message: StreamMessage<MessageType.NEW_MESSAGE> = {
          version: '1.0',
          type: MessageType.NEW_MESSAGE,
          payload: {
            receivedAt: Date.now(),
            channelCode: 'test-channel',
            channelId: '-1001234567890',
            messageId: 123,
            traceToken: 'trace-123',
            exp: -1000,
          },
        };

        const result = await validator.validate(message);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject NEW_MESSAGE with invalid exp (zero)', async () => {
        const message: StreamMessage<MessageType.NEW_MESSAGE> = {
          version: '1.0',
          type: MessageType.NEW_MESSAGE,
          payload: {
            receivedAt: Date.now(),
            channelCode: 'test-channel',
            channelId: '-1001234567890',
            messageId: 123,
            traceToken: 'trace-123',
            exp: 0,
          },
        };

        const result = await validator.validate(message);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject NEW_MESSAGE with non-integer messageId', async () => {
        const message = {
          version: '1.0',
          type: MessageType.NEW_MESSAGE,
          payload: {
            receivedAt: Date.now(),
            channelCode: 'test-channel',
            channelId: '-1001234567890',
            messageId: 123.5,
            exp: Date.now() + 60000,
          },
        } as any;

        const result = await validator.validate(message);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });

      it('should reject NEW_MESSAGE with missing required fields', async () => {
        const message = {
          version: '1.0',
          type: MessageType.NEW_MESSAGE,
          payload: {
            receivedAt: Date.now(),
            channelCode: 'test-channel',
            // missing channelId, messageId, exp
          },
        } as any;

        const result = await validator.validate(message);
        expect(result.valid).toBe(false);
        expect(result.error).toBeDefined();
      });
    });

    it('should reject message with unknown type', async () => {
      const message = {
        version: '1.0',
        type: 'UNKNOWN_TYPE' as any,
        payload: {},
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('isExpired', () => {
    it('should return true for expired message', () => {
      const message: StreamMessage<MessageType.NEW_MESSAGE> = {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          receivedAt: Date.now(),
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 123,
          traceToken: 'trace-123',
          exp: Date.now() - 1000, // Expired 1 second ago
        },
      };

      const result = validator.isExpired(message);
      expect(result).toBe(true);
    });

    it('should return false for non-expired message', () => {
      const message: StreamMessage<MessageType.NEW_MESSAGE> = {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          receivedAt: Date.now(),
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 123,
          traceToken: 'trace-123',
          exp: Date.now() + 60000, // Expires in 1 minute
        },
      };

      const result = validator.isExpired(message);
      expect(result).toBe(false);
    });

    it('should return false for message without exp field', () => {
      const message = {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          receivedAt: Date.now(),
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 123,
        },
      } as any;

      const result = validator.isExpired(message);
      expect(result).toBe(false);
    });

    it('should return false for message with invalid exp type', () => {
      const message = {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          receivedAt: Date.now(),
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 123,
          traceToken: 'trace-123',
          exp: 'not-a-number',
        },
      } as any;

      const result = validator.isExpired(message);
      expect(result).toBe(false);
    });

    it('should return true for message expiring at current time', async () => {
      const now = Date.now();
      const message: StreamMessage<MessageType.NEW_MESSAGE> = {
        version: '1.0',
        type: MessageType.NEW_MESSAGE,
        payload: {
          receivedAt: Date.now(),
          channelCode: 'test-channel',
          channelId: '-1001234567890',
          messageId: 123,
          traceToken: 'trace-123',
          exp: now - 1, // Set to 1ms in the past to avoid timing issues
        },
      };

      const result = validator.isExpired(message);
      expect(result).toBe(true);
    });
  });

  describe('TRANSLATE_MESSAGE_REQUEST validation', () => {
    it('should validate a correct TRANSLATE_MESSAGE_REQUEST', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_REQUEST> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          promptId: 'prompt-123',
          receivedAt: Date.now(),
          traceToken: 'trace-msg-123',
          exp: Date.now() + 60000,
          messageId: 12345,
          channelId: '-1001234567890',
          messageText: 'Test message',
          prevMessage: 'Previous message',
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
          promptId: 'prompt-123',
          receivedAt: Date.now(),
          traceToken: 'trace-msg-123',
          exp: Date.now() + 60000,
          messageId: 12345,
          channelId: '-1001234567890',
          messageText: 'Test message',
          prevMessage: 'Previous message',
          quotedMessage: 'Quoted message',
          quotedFirstMessage: 'First quoted message',
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should reject TRANSLATE_MESSAGE_REQUEST with missing promptId', async () => {
      const message = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          traceToken: 'trace-msg-123',
          exp: Date.now() + 60000,
          messageId: 12345,
          channelId: '-1001234567890',
          messageText: 'Test message',
          prevMessage: 'Previous message',
        },
      } as any;

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
          receivedAt: Date.now(),
          traceToken: 'trace-msg-123',
          exp: Date.now() + 60000,
          messageId: 12345,
          channelId: '-1001234567890',
          messageText: 'Test message',
          prevMessage: 'Previous message',
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject TRANSLATE_MESSAGE_REQUEST with missing required fields', async () => {
      const message = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_REQUEST,
        payload: {
          promptId: 'prompt-123',
          receivedAt: Date.now(),
          // missing exp, messageId, channelId, messageText, prevMessage
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('TRANSLATE_MESSAGE_RESULT validation', () => {
    it('should validate a correct TRANSLATE_MESSAGE_RESULT with commands array', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-123',
          receivedAt: Date.now(),
          traceToken: 'trace-msg-123',
          messageId: 12345,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: true,
              command: 'LONG' as any,
              confidence: 0.95,
              reason: 'Message contains LONG command',
              extraction: {
                symbol: 'BTCUSDT',
                isImmediate: true,
                entry: 50000,
                stopLoss: {
                  price: 49000,
                },
                takeProfits: [{ price: 51000 }],
              },
            },
          ],
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate TRANSLATE_MESSAGE_RESULT without extraction (not a command)', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-123',
          receivedAt: Date.now(),
          traceToken: 'trace-msg-123',
          messageId: 12345,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: false,
              command: 'NONE' as any,
              confidence: 0.3,
              reason: 'Not a trading command',
            },
          ],
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should reject TRANSLATE_MESSAGE_RESULT with missing promptId', async () => {
      const message = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          receivedAt: Date.now(),
          traceToken: 'trace-msg-123',
          messageId: 12345,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: false,
              command: 'NONE',
              confidence: 0.3,
              reason: 'Test',
            },
          ],
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject TRANSLATE_MESSAGE_RESULT with empty promptId', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: '',
          receivedAt: Date.now(),
          traceToken: 'trace-msg-123',
          messageId: 12345,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: false,
              command: 'NONE' as any,
              confidence: 0.3,
              reason: 'Test',
            },
          ],
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject TRANSLATE_MESSAGE_RESULT with invalid confidence (> 1)', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-123',
          receivedAt: Date.now(),
          traceToken: 'trace-msg-123',
          messageId: 12345,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: true,
              command: 'LONG' as any,
              confidence: 1.5,
              reason: 'Test',
            },
          ],
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject TRANSLATE_MESSAGE_RESULT with invalid confidence (< 0)', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-123',
          receivedAt: Date.now(),
          traceToken: 'trace-msg-123',
          messageId: 12345,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: true,
              command: 'LONG' as any,
              confidence: -0.1,
              reason: 'Test',
            },
          ],
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject TRANSLATE_MESSAGE_RESULT with missing required fields', async () => {
      const message = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-123',
          receivedAt: Date.now(),
          // missing traceToken, messageId, channelId, commands
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject TRANSLATE_MESSAGE_RESULT with empty commands array', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-123',
          receivedAt: Date.now(),
          traceToken: 'trace-msg-123',
          messageId: 12345,
          channelId: '-1001234567890',
          commands: [],
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('LIVE_PRICE_UPDATE validation', () => {
    it('should validate a correct LIVE_PRICE_UPDATE', async () => {
      const message: StreamMessage<MessageType.LIVE_PRICE_UPDATE> = {
        version: '1.0',
        type: MessageType.LIVE_PRICE_UPDATE,
        payload: {
          accountId: 'test-account',
          channelId: 'test-channel',
          symbol: 'XAUUSD',
          currentPrice: {
            bid: 2650.5,
            ask: 2650.7,
          },
          previousPrice: {
            bid: 2650.4,
            ask: 2650.6,
          },
          timestamp: Date.now(),
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should reject LIVE_PRICE_UPDATE with missing bid or ask', async () => {
      const message: StreamMessage<MessageType.LIVE_PRICE_UPDATE> = {
        version: '1.0',
        type: MessageType.LIVE_PRICE_UPDATE,
        payload: {
          accountId: 'test-account',
          channelId: 'test-channel',
          symbol: 'XAUUSD',
          currentPrice: {
            bid: 2650.5,
            // missing ask
          } as any,
          previousPrice: {
            ask: 2650.6,
            // missing bid
          } as any,
          timestamp: Date.now(),
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('ask');
    });

    it('should reject LIVE_PRICE_UPDATE with missing accountId', async () => {
      const message = {
        version: '1.0',
        type: MessageType.LIVE_PRICE_UPDATE,
        payload: {
          channelId: 'test-channel',
          symbol: 'XAUUSD',
          currentPrice: { bid: 100, ask: 101 },
          previousPrice: { bid: 99, ask: 100 },
          timestamp: Date.now(),
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('accountId');
    });

    it('should reject LIVE_PRICE_UPDATE with empty symbol', async () => {
      const message: StreamMessage<MessageType.LIVE_PRICE_UPDATE> = {
        version: '1.0',
        type: MessageType.LIVE_PRICE_UPDATE,
        payload: {
          accountId: 'test-account',
          channelId: 'test-channel',
          symbol: '',
          currentPrice: { bid: 100, ask: 101 },
          previousPrice: { bid: 99, ask: 100 },
          timestamp: Date.now(),
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('symbol');
    });

    it('should reject LIVE_PRICE_UPDATE with negative timestamp', async () => {
      const message: StreamMessage<MessageType.LIVE_PRICE_UPDATE> = {
        version: '1.0',
        type: MessageType.LIVE_PRICE_UPDATE,
        payload: {
          accountId: 'test-account',
          channelId: 'test-channel',
          symbol: 'XAUUSD',
          currentPrice: { bid: 100, ask: 101 },
          previousPrice: { bid: 99, ask: 100 },
          timestamp: -1,
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('timestamp');
    });
  });
});
