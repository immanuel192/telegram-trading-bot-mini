/**
 * Unit tests for Close Partial command utilities
 */

import {
  transformToClosePartialPayload,
  generateTpTierMessageId,
} from '../../../../src/services/transformers/close-partial-command.transformer';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';

describe('ClosePartialCommand Utilities', () => {
  describe('transformToClosePartialPayload', () => {
    it('should create a payload with CLOSE_PARTIAL command', () => {
      const params = {
        orderId: 'order-123',
        messageId: 45601,
        channelId: 'chan-1',
        accountId: 'acc-1',
        traceToken: 'trace-1',
        symbol: 'BTCUSD',
        timestamp: 1625097600000,
        lotSize: 0.1,
      };

      const result = transformToClosePartialPayload(params);

      expect(result).toMatchObject({
        ...params,
        command: CommandEnum.CLOSE_PARTIAL,
      });
    });
  });

  describe('generateTpTierMessageId', () => {
    it('should correctly map TP1 to suffix 01', () => {
      const originalMessageId = 123;
      const tierIndex = 1;
      const result = generateTpTierMessageId(originalMessageId, tierIndex);
      expect(result).toBe(12301);
    });

    it('should correctly map TP3 to suffix 03', () => {
      const originalMessageId = 5555;
      const tierIndex = 3;
      const result = generateTpTierMessageId(originalMessageId, tierIndex);
      expect(result).toBe(555503);
    });
  });
});
