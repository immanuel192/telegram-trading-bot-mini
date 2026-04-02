/**
 * Unit tests for ExecuteOrderRequestPayload schema validation
 */

import { MessageValidator } from '../../src/stream/validators/message-validator';
import { StreamMessage } from '../../src/stream/stream-interfaces';
import { MessageType } from '../../src/interfaces/messages/message-type';
import { CommandEnum } from '../../src/interfaces/messages/command-enum';

describe('EXECUTE_ORDER_REQUEST validation', () => {
  let validator: MessageValidator;

  beforeEach(() => {
    validator = new MessageValidator();
  });

  describe('valid payloads', () => {
    it('should validate EXECUTE_ORDER_REQUEST with LONG command (market order)', async () => {
      const message: StreamMessage<MessageType.EXECUTE_ORDER_REQUEST> = {
        version: '1.0',
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: {
          orderId: 'order-123',
          messageId: 123,
          channelId: '-1001234567890',
          accountId: 'test-account-001',
          traceToken: 'trace-123',
          symbol: 'XAUUSD',
          command: CommandEnum.LONG,
          lotSize: 0.1,
          isImmediate: true,
          stopLoss: {
            price: 2640,
          },
          takeProfits: [{ price: 2670 }, { price: 2680 }],
          timestamp: Date.now(),
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate EXECUTE_ORDER_REQUEST with SHORT command (limit order)', async () => {
      const message: StreamMessage<MessageType.EXECUTE_ORDER_REQUEST> = {
        version: '1.0',
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: {
          orderId: 'order-456',
          messageId: 456,
          channelId: '-1001234567890',
          accountId: 'test-account-002',
          traceToken: 'trace-456',
          symbol: 'BTCUSD',
          command: CommandEnum.SHORT,
          lotSize: 0.5,
          isImmediate: false,
          entry: 50000,
          stopLoss: {
            pips: 100,
          },
          takeProfits: [{ pips: 200 }],
          leverage: 10,
          timestamp: Date.now(),
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate EXECUTE_ORDER_REQUEST with MOVE_SL command', async () => {
      const message: StreamMessage<MessageType.EXECUTE_ORDER_REQUEST> = {
        version: '1.0',
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: {
          orderId: 'order-789',
          messageId: 789,
          channelId: '-1001234567890',
          accountId: 'test-account-003',
          traceToken: 'trace-789',
          symbol: 'EURUSD',
          command: CommandEnum.MOVE_SL,
          lotSize: 0,
          stopLoss: {
            price: 1.08,
          },
          timestamp: Date.now(),
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate with both price and pips in stopLoss', async () => {
      const message: StreamMessage<MessageType.EXECUTE_ORDER_REQUEST> = {
        version: '1.0',
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: {
          orderId: 'order-111',
          messageId: 111,
          channelId: '-1001234567890',
          accountId: 'test-account-005',
          traceToken: 'trace-111',
          symbol: 'XAUUSD',
          command: CommandEnum.LONG,
          lotSize: 0.2,
          isImmediate: true,
          stopLoss: {
            price: 2640,
            pips: 50,
          },
          takeProfits: [{ price: 2670, pips: 100 }],
          timestamp: Date.now(),
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate with multiple takeProfits', async () => {
      const message: StreamMessage<MessageType.EXECUTE_ORDER_REQUEST> = {
        version: '1.0',
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: {
          orderId: 'order-222',
          messageId: 222,
          channelId: '-1001234567890',
          accountId: 'test-account-006',
          traceToken: 'trace-222',
          symbol: 'EURUSD',
          command: CommandEnum.LONG,
          lotSize: 1.0,
          entry: 1.08,
          stopLoss: {
            price: 1.07,
          },
          takeProfits: [{ price: 1.09 }, { price: 1.1 }, { price: 1.11 }],
          timestamp: Date.now(),
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate without optional fields', async () => {
      const message: StreamMessage<MessageType.EXECUTE_ORDER_REQUEST> = {
        version: '1.0',
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: {
          orderId: 'order-333',
          messageId: 333,
          channelId: '-1001234567890',
          accountId: 'test-account-007',
          traceToken: 'trace-333',
          symbol: 'BTCUSD',
          command: CommandEnum.LONG,
          lotSize: 0.1,
          timestamp: Date.now(),
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate all CommandEnum values', async () => {
      const commands = [
        CommandEnum.LONG,
        CommandEnum.SHORT,
        CommandEnum.MOVE_SL,
        CommandEnum.SET_TP_SL,
        CommandEnum.CLOSE_ALL,
        CommandEnum.CANCEL,
      ];

      for (const command of commands) {
        const message: StreamMessage<MessageType.EXECUTE_ORDER_REQUEST> = {
          version: '1.0',
          type: MessageType.EXECUTE_ORDER_REQUEST,
          payload: {
            orderId: 'order-444',
            messageId: 444,
            channelId: '-1001234567890',
            accountId: 'test-account-008',
            traceToken: `trace-${command}`,
            symbol: 'XAUUSD',
            command,
            lotSize: 0.1,
            timestamp: Date.now(),
          },
        };

        const result = await validator.validate(message);
        expect(result.valid).toBe(true);
      }
    });

    it('should validate without lotSize (executor will calculate)', async () => {
      const message: StreamMessage<MessageType.EXECUTE_ORDER_REQUEST> = {
        version: '1.0',
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: {
          orderId: 'order-555',
          messageId: 555,
          channelId: '-1001234567890',
          accountId: 'test-account-009',
          traceToken: 'trace-555',
          symbol: 'EURUSD',
          command: CommandEnum.LONG,
          // lotSize omitted - executor will calculate based on account config
          entry: 1.08,
          stopLoss: {
            price: 1.07,
          },
          timestamp: Date.now(),
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate with meta.skipLinkedOrderSync flag', async () => {
      const message: StreamMessage<MessageType.EXECUTE_ORDER_REQUEST> = {
        version: '1.0',
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: {
          orderId: 'order-666',
          messageId: 666,
          channelId: '-1001234567890',
          accountId: 'test-account-010',
          traceToken: 'trace-666',
          symbol: 'XAUUSD',
          command: CommandEnum.SET_TP_SL,
          lotSize: 0.1,
          stopLoss: {
            price: 2640,
          },
          takeProfits: [{ price: 2670 }],
          meta: {
            executionInstructions: {
              skipLinkedOrderSync: true,
            },
          },
          timestamp: Date.now(),
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });

    it('should validate with all meta flags', async () => {
      const message: StreamMessage<MessageType.EXECUTE_ORDER_REQUEST> = {
        version: '1.0',
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: {
          orderId: 'order-777',
          messageId: 777,
          channelId: '-1001234567890',
          accountId: 'test-account-011',
          traceToken: 'trace-777',
          symbol: 'BTCUSD',
          command: CommandEnum.LONG,
          lotSize: 0.5,
          entry: 50000,
          stopLoss: {
            price: 49500,
          },
          meta: {
            reduceLotSize: true,
            adjustEntry: true,
            executionInstructions: {
              skipLinkedOrderSync: false,
            },
          },
          timestamp: Date.now(),
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(true);
    });
  });

  describe('invalid payloads', () => {
    it('should reject EXECUTE_ORDER_REQUEST with missing required fields', async () => {
      const message = {
        version: '1.0',
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: {
          messageId: 555,
          channelId: '-1001234567890',
          // missing accountId, traceToken, symbol, command, lotSize, timestamp
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should reject EXECUTE_ORDER_REQUEST with invalid messageId', async () => {
      const message: StreamMessage<MessageType.EXECUTE_ORDER_REQUEST> = {
        version: '1.0',
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: {
          orderId: 'order-666',
          messageId: 0,
          channelId: '-1001234567890',
          accountId: 'test-account-009',
          traceToken: 'trace-666',
          symbol: 'EURUSD',
          command: CommandEnum.LONG,
          lotSize: 0.1,
          timestamp: Date.now(),
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
    });

    it('should reject EXECUTE_ORDER_REQUEST with negative lotSize', async () => {
      const message: StreamMessage<MessageType.EXECUTE_ORDER_REQUEST> = {
        version: '1.0',
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: {
          orderId: 'order-777',
          messageId: 777,
          channelId: '-1001234567890',
          accountId: 'test-account-010',
          traceToken: 'trace-777',
          symbol: 'BTCUSD',
          command: CommandEnum.LONG,
          lotSize: -0.1,
          timestamp: Date.now(),
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
    });

    it('should reject EXECUTE_ORDER_REQUEST with negative entry price', async () => {
      const message: StreamMessage<MessageType.EXECUTE_ORDER_REQUEST> = {
        version: '1.0',
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: {
          orderId: 'order-888',
          messageId: 888,
          channelId: '-1001234567890',
          accountId: 'test-account-011',
          traceToken: 'trace-888',
          symbol: 'XAUUSD',
          command: CommandEnum.LONG,
          lotSize: 0.1,
          entry: -2650,
          timestamp: Date.now(),
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
    });

    it('should reject EXECUTE_ORDER_REQUEST with invalid command enum', async () => {
      const message = {
        version: '1.0',
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: {
          orderId: 'order-999',
          messageId: 999,
          channelId: '-1001234567890',
          accountId: 'test-account-012',
          traceToken: 'trace-999',
          symbol: 'EURUSD',
          command: 'INVALID_COMMAND',
          lotSize: 0.1,
          timestamp: Date.now(),
        },
      } as any;

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
    });

    it('should reject EXECUTE_ORDER_REQUEST with empty symbol', async () => {
      const message: StreamMessage<MessageType.EXECUTE_ORDER_REQUEST> = {
        version: '1.0',
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: {
          orderId: 'order-1111',
          messageId: 1111,
          channelId: '-1001234567890',
          accountId: 'test-account-013',
          traceToken: 'trace-1111',
          symbol: '',
          command: CommandEnum.LONG,
          lotSize: 0.1,
          timestamp: Date.now(),
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
    });

    it('should reject EXECUTE_ORDER_REQUEST with invalid timestamp', async () => {
      const message: StreamMessage<MessageType.EXECUTE_ORDER_REQUEST> = {
        version: '1.0',
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: {
          orderId: 'order-1212',
          messageId: 1212,
          channelId: '-1001234567890',
          accountId: 'test-account-014',
          traceToken: 'trace-1212',
          symbol: 'BTCUSD',
          command: CommandEnum.LONG,
          lotSize: 0.1,
          timestamp: 0,
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
    });

    it('should reject EXECUTE_ORDER_REQUEST with leverage < 1', async () => {
      const message: StreamMessage<MessageType.EXECUTE_ORDER_REQUEST> = {
        version: '1.0',
        type: MessageType.EXECUTE_ORDER_REQUEST,
        payload: {
          orderId: 'order-1313',
          messageId: 1313,
          channelId: '-1001234567890',
          accountId: 'test-account-015',
          traceToken: 'trace-1313',
          symbol: 'XAUUSD',
          command: CommandEnum.LONG,
          lotSize: 0.1,
          leverage: 0.5,
          timestamp: Date.now(),
        },
      };

      const result = await validator.validate(message);
      expect(result.valid).toBe(false);
    });
  });
});
