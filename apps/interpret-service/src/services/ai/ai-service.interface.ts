/**
 * Purpose: Define the AI service interface for message translation.
 * Exports: IAIService interface, MessageContext types.
 * Core Flow: Unified interface for AI providers to translate Telegram messages into structured trading commands.
 */

import { TranslationResult } from './types';

/**
 * Message context for AI interpretation
 * Provides surrounding messages for context-aware translation
 * Note: Order validation is now handled by trade-manager, not AI
 */
export interface MessageContext {
  /**
   * Previous message text in the channel (for context)
   */
  prevMessage: string;
  /**
   * Quoted/replied message text (optional)
   */
  quotedMessage?: string;
  /**
   * First message in quote chain (optional, for threaded replies)
   */
  quotedFirstMessage?: string;
}

/**
 * AI Service interface for message translation
 * Implementations use single-step pipeline with session caching
 */
export interface IAIService {
  /**
   * Translate a Telegram message into structured trading commands
   * Uses session caching for improved performance:
   * - Sessions are cached by (channelId, promptId, promptHash)
   * - AI combines classification and extraction in one call
   * - Sessions expire at 8 AM Sydney time or after 100 messages
   *
   * @param messageText - The raw message text to translate
   * @param context - Surrounding messages for context
   * @param channelId - Channel identifier for session caching
   * @param promptId - Prompt rule identifier for session caching
   * @param traceToken - Optional trace token for request tracking
   * @returns Array of translation results (supports multiple commands per message)
   * @throws Error if AI service fails or returns invalid response
   */
  translateMessage(
    messageText: string,
    context: MessageContext,
    channelId: string,
    promptId: string,
    traceToken?: string
  ): Promise<TranslationResult[]>;
}
