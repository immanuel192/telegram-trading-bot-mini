/**
 * Purpose: Helper utility to build test context for AI service prompt testing
 * Exports: buildTestContext function
 * Core Flow: Accepts message text and options → Returns context object for IAIService
 */

/**
 * Options for building test context
 */
export interface BuildTestContextOptions {
  /** Previous message text */
  prevMessage?: string;
  /** Quoted message text */
  quotedMessage?: string;
  /** Quoted first message text */
  quotedFirstMessage?: string;
}

/**
 * Build test context for AI service
 *
 * @param messageText - The message text to translate
 * @param options - Optional context parameters
 * @returns Context object matching IAIService requirements
 *
 * @example
 * ```typescript
 * const context = buildTestContext('LONG BTC 50000', {
 *   prevMessage: 'Previous signal',
 * });
 *
 * const result = await aiService.translateMessage(
 *   'LONG BTC 50000',
 *   context,
 *   channelId,
 *   promptId
 * );
 * ```
 */
export function buildTestContext(options: BuildTestContextOptions = {}): {
  prevMessage: string;
  quotedMessage?: string;
  quotedFirstMessage?: string;
} {
  return {
    prevMessage: options.prevMessage || '',
    quotedMessage: options.quotedMessage,
    quotedFirstMessage: options.quotedFirstMessage,
  };
}
