/**
 * Unit tests for trace token utilities
 */

import { suiteName } from '@telegram-trading-bot-mini/shared/test-utils';
import { generateTraceToken, parseTraceToken } from '../../src/trace-token';

describe(suiteName(__filename), () => {
  describe('generateTraceToken', () => {
    it('should generate trace token with correct format', () => {
      const token = generateTraceToken(12345, '-1003409608482');
      expect(token).toBe('12345-1003409608482');
    });

    it('should handle single digit message IDs', () => {
      const token = generateTraceToken(1, '-1003409608482');
      expect(token).toBe('1-1003409608482');
    });

    it('should handle large message IDs', () => {
      const token = generateTraceToken(999999999, '-1003409608482');
      expect(token).toBe('999999999-1003409608482');
    });

    it('should handle different channel IDs', () => {
      const token = generateTraceToken(12345, '-1001234567890');
      expect(token).toBe('12345-1001234567890');
    });
  });

  describe('parseTraceToken', () => {
    it('should parse valid trace token correctly', () => {
      const result = parseTraceToken('12345-1003409608482');
      expect(result).toEqual({
        messageId: 12345,
        channelId: '-1003409608482',
      });
    });

    it('should parse single digit message IDs', () => {
      const result = parseTraceToken('1-1003409608482');
      expect(result).toEqual({
        messageId: 1,
        channelId: '-1003409608482',
      });
    });

    it('should parse large message IDs', () => {
      const result = parseTraceToken('999999999-1003409608482');
      expect(result).toEqual({
        messageId: 999999999,
        channelId: '-1003409608482',
      });
    });

    it('should return null for invalid format - missing channel ID', () => {
      const result = parseTraceToken('12345');
      expect(result).toBeNull();
    });

    it('should return null for invalid format - no dash', () => {
      const result = parseTraceToken('123451003409608482');
      expect(result).toBeNull();
    });

    it('should return null for invalid format - non-numeric message ID', () => {
      const result = parseTraceToken('abc-1003409608482');
      expect(result).toBeNull();
    });

    it('should return null for invalid format - non-numeric channel ID', () => {
      const result = parseTraceToken('12345-abc');
      expect(result).toBeNull();
    });

    it('should return null for empty string', () => {
      const result = parseTraceToken('');
      expect(result).toBeNull();
    });

    it('should return null for invalid format - positive channel ID', () => {
      const result = parseTraceToken('12345-1003409608482');
      expect(result).toEqual({
        messageId: 12345,
        channelId: '-1003409608482',
      });
    });
  });

  describe('round-trip conversion', () => {
    it('should maintain data integrity through generate and parse', () => {
      const messageId = 12345;
      const channelId = '-1003409608482';

      const token = generateTraceToken(messageId, channelId);
      const parsed = parseTraceToken(token);

      expect(parsed).toEqual({ messageId, channelId });
    });

    it('should handle edge case message IDs', () => {
      const testCases = [
        { messageId: 1, channelId: '-1001234567890' },
        { messageId: 999999, channelId: '-1009876543210' },
        { messageId: 42, channelId: '-1003409608482' },
      ];

      testCases.forEach(({ messageId, channelId }) => {
        const token = generateTraceToken(messageId, channelId);
        const parsed = parseTraceToken(token);
        expect(parsed).toEqual({ messageId, channelId });
      });
    });
  });
});
