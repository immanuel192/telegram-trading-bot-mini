/**
 * Trace token utilities for tracking messages across services
 *
 * Trace tokens follow the format: {messageId}{channelId}
 * Example: 12345-1003409608482
 *
 * This format is:
 * - Unique per message
 * - Human-readable
 * - Easy to search in logs
 * - Consistent across all services
 */

/**
 * Generate a trace token for a Telegram message
 *
 * @param messageId - Telegram message ID
 * @param channelId - Telegram channel ID
 * @returns Trace token in format: {messageId}{channelId}
 *
 * @example
 * generateTraceToken(12345, '-1003409608482')
 * // Returns: '12345-1003409608482'
 */
export function generateTraceToken(
  messageId: number,
  channelId: string
): string {
  return `${messageId}${channelId}`;
}

/**
 * Parse a trace token back into its components
 *
 * @param traceToken - Trace token to parse
 * @returns Object with messageId and channelId, or null if invalid
 *
 * @example
 * parseTraceToken('12345-1003409608482')
 * // Returns: { messageId: 12345, channelId: '-1003409608482' }
 */
export function parseTraceToken(traceToken: string): {
  messageId: number;
  channelId: string;
} | null {
  // Expected format: {messageId}{channelId}
  // channelId typically starts with - for channels
  const match = traceToken.match(/^(\d+)(-\d+)$/);

  if (!match) {
    return null;
  }

  return {
    messageId: parseInt(match[1], 10),
    channelId: match[2],
  };
}
