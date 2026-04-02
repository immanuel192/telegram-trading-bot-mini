/**
 * Unit tests for TRANSLATE_MESSAGE_RESULT validation (commands array schema)
 */

import { MessageValidator } from '../../src/stream/validators/message-validator';
import { StreamMessage } from '../../src/stream/stream-interfaces';
import { MessageType } from '../../src/interfaces/messages/message-type';
import {
  CommandEnum,
  CommandSide,
} from '../../src/interfaces/messages/command-enum';

describe('TRANSLATE_MESSAGE_RESULT validation (commands array schema)', () => {
  let validator: MessageValidator;

  beforeEach(() => {
    validator = new MessageValidator();
  });

  describe('valid payloads', () => {
    it('should validate TRANSLATE_MESSAGE_RESULT with single LONG command', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          receivedAt: Date.now(),
          messageId: 12345,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: true,
              command: CommandEnum.LONG,
              confidence: 0.95,
              reason: 'Message contains LONG command with entry zone',
              extraction: {
                symbol: 'XAUUSD',
                side: CommandSide.BUY,
                isImmediate: false,
                entryZone: [2650, 2655],
                stopLoss: {
                  price: 2640,
                },
                takeProfits: [{ price: 2670 }, { price: 2680 }],
              },
            },
          ],
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate TRANSLATE_MESSAGE_RESULT with SHORT command (immediate)', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          receivedAt: Date.now(),
          messageId: 45678,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: true,
              command: CommandEnum.SHORT,
              confidence: 0.92,
              reason: 'Message contains SHORT command with market entry',
              extraction: {
                symbol: 'BTCUSD',
                side: CommandSide.SELL,
                isImmediate: true,
                entry: 50000,
                stopLoss: {
                  price: 51000,
                },
                takeProfits: [{ price: 49000 }],
              },
            },
          ],
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate TRANSLATE_MESSAGE_RESULT with NONE command', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          receivedAt: Date.now(),
          messageId: 78901,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: false,
              command: CommandEnum.NONE,
              confidence: 0.85,
              reason: 'Message is just a greeting',
            },
          ],
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate TRANSLATE_MESSAGE_RESULT with multiple commands', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          receivedAt: Date.now(),
          messageId: 99999,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: true,
              command: CommandEnum.LONG,
              confidence: 0.9,
              reason: 'First LONG command',
              extraction: {
                symbol: 'EURUSD',
                side: CommandSide.BUY,
                isImmediate: true,
                entry: 1.08,
                stopLoss: {
                  price: 1.07,
                },
                takeProfits: [{ price: 1.09 }],
              },
            },
            {
              isCommand: true,
              command: CommandEnum.SHORT,
              confidence: 0.88,
              reason: 'Second SHORT command',
              extraction: {
                symbol: 'GBPUSD',
                side: CommandSide.SELL,
                isImmediate: false,
                entryZone: [1.25, 1.26],
                stopLoss: {
                  pips: 50,
                },
                takeProfits: [{ pips: 100 }],
              },
            },
          ],
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate TRANSLATE_MESSAGE_RESULT with MOVE_SL command', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          receivedAt: Date.now(),
          messageId: 22222,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: true,
              command: CommandEnum.MOVE_SL,
              confidence: 0.93,
              reason: 'Move stop loss to breakeven',
              extraction: {
                symbol: 'XAUUSD',
                stopLoss: {
                  price: 2650,
                },
              },
            },
          ],
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate extraction with meta fields', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          receivedAt: Date.now(),
          messageId: 33333,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: true,
              command: CommandEnum.LONG,
              confidence: 0.88,
              reason: 'LONG with meta flags',
              extraction: {
                symbol: 'GBPUSD',
                side: CommandSide.BUY,
                isImmediate: false,
                meta: {
                  reduceLotSize: true,
                  adjustEntry: true,
                },
                entry: 1.25,
                stopLoss: {
                  price: 1.24,
                },
                takeProfits: [{ price: 1.26 }, { pips: 50 }],
              },
            },
          ],
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate extraction with validationError', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          receivedAt: Date.now(),
          messageId: 44444,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: true,
              command: CommandEnum.LONG,
              confidence: 0.6,
              reason: 'Partial extraction with error',
              extraction: {
                symbol: 'XAUUSD',
                validationError: 'Missing stop loss',
              },
            },
          ],
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate extraction with isLinkedWithPrevious', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          receivedAt: Date.now(),
          messageId: 55555,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: true,
              command: CommandEnum.LONG,
              confidence: 0.87,
              reason: 'DCA order linked to previous',
              extraction: {
                symbol: 'BTCUSD',
                side: CommandSide.BUY,
                isImmediate: false,
                isLinkedWithPrevious: true,
                entryZone: [49000, 49500],
                stopLoss: {
                  price: 48000,
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
  });

  describe('invalid payloads', () => {
    it('should reject TRANSLATE_MESSAGE_RESULT with missing required fields', async () => {
      const message = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          // missing receivedAt, messageId, channelId, commands
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
          traceToken: 'trace-test',
          receivedAt: Date.now(),
          messageId: 12345,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: false,
              command: CommandEnum.NONE,
              confidence: 0.5,
              reason: 'Test',
            },
          ],
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
    });

    it('should reject TRANSLATE_MESSAGE_RESULT with confidence > 1', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          receivedAt: Date.now(),
          messageId: 12345,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: false,
              command: CommandEnum.NONE,
              confidence: 1.5,
              reason: 'Test',
            },
          ],
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
    });

    it('should reject TRANSLATE_MESSAGE_RESULT with confidence < 0', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          receivedAt: Date.now(),
          messageId: 12345,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: false,
              command: CommandEnum.NONE,
              confidence: -0.1,
              reason: 'Test',
            },
          ],
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
    });

    it('should reject TRANSLATE_MESSAGE_RESULT with invalid receivedAt', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          receivedAt: 0,
          messageId: 12345,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: false,
              command: CommandEnum.NONE,
              confidence: 0.5,
              reason: 'Test',
            },
          ],
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
    });

    it('should reject TRANSLATE_MESSAGE_RESULT with invalid command enum', async () => {
      const message = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          receivedAt: Date.now(),
          messageId: 12345,
          channelId: '-1001234567890',
          commands: [
            {
              isCommand: true,
              command: 'INVALID_COMMAND',
              confidence: 0.9,
              reason: 'Test',
            },
          ],
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
    });

    it('should reject TRANSLATE_MESSAGE_RESULT with empty commands array', async () => {
      const message: StreamMessage<MessageType.TRANSLATE_MESSAGE_RESULT> = {
        version: '1.0',
        type: MessageType.TRANSLATE_MESSAGE_RESULT,
        payload: {
          promptId: 'prompt-default',
          traceToken: 'trace-test',
          receivedAt: Date.now(),
          messageId: 12345,
          channelId: '-1001234567890',
          commands: [],
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
    });
  });
});
