/**
 * Purpose: Implement Gemini AI service for message translation using chat session caching.
 * Exports: GeminiAIService class implementing IAIService.
 * Core Flow: Single-step pipeline using cached sessions: get/create session → send message → parse combined response.
 */

import { IAIService, MessageContext } from '../../ai-service.interface';
import { TranslationResult } from '../../types';
import { Logger } from 'pino';
import { GeminiSessionManager } from './gemini-session-manager';
import { AIResponse, AIResponseSchema } from '../../schemas/ai-response.schema';
import {
  CommandEnum,
  CommandSide,
} from '@telegram-trading-bot-mini/shared/utils';

/**
 * Gemini AI Service implementation with chat session caching
 * Uses single-step pipeline for efficient message translation:
 * - Reuses chat sessions per (channelId, promptId, promptHash)
 * - Combines classification and extraction in one API call
 * - Handles session expiration (8 AM Sydney + 100 message limit)
 */
export class GeminiAIService implements IAIService {
  /**
   * @param chatSessionManager - Manages chat sessions and handles all AI interactions
   * @param logger - Logger instance
   */
  constructor(
    private readonly chatSessionManager: GeminiSessionManager,
    private readonly logger: Logger,
  ) {
    this.logger.info('GeminiAIService initialized with session caching');
  }

  /**
   * Translate message using single-step pipeline with session caching
   * Uses ChatSessionManager to reuse sessions and reduce AI processing time
   *
   * @param messageText - Raw message text
   * @param context - Message context (prev messages, etc.)
   * @param channelId - Channel identifier for session caching
   * @param channelId - Channel identifier for session caching
   * @param promptId - Prompt rule identifier for session caching
   * @param traceToken - Trace token for request tracking
   * @returns Translation result with classification and optional extraction
   */
  async translateMessage(
    messageText: string,
    context: MessageContext,
    channelId: string,
    promptId: string,
    traceToken?: string,
  ): Promise<TranslationResult[]> {
    this.logger.debug(
      {
        messageText: messageText.substring(0, 100),
        channelId,
        promptId,
        traceToken,
      },
      'Starting message translation with session caching',
    );

    try {
      // Get or create cached session
      // Note: Using 'default' as placeholder accountId for session isolation
      const session = await this.chatSessionManager.getOrCreateSession(
        channelId,
        'default', // Placeholder - sessions cached by channelId + promptId only
        promptId,
      );

      // Build context-aware user message
      // Pass context directly as JSON - no need for intermediate transformation
      const contextJson = JSON.stringify(context, null, 2);
      const userMessage = `Context: ${contextJson}\n\nMessage to translate: "${messageText}"`;

      this.logger.debug(
        {
          channelId,
          promptId,
          traceToken,
          messageLength: userMessage.length,
        },
        'Sending message to AI session',
      );

      // Send message via cached session (auto-increments message count)
      const response = await session.sendMessage(userMessage);
      const responseText = response.response.text();

      this.logger.debug(
        { responseLength: responseText.length, traceToken },
        'Received AI response',
      );

      // Parse JSON response and standardize to TranslationResult format
      const aiResponse = JSON.parse(responseText);
      const results = this.standardliseResponse(aiResponse);

      this.logger.info(
        {
          commandCount: results.length,
          isCommand: results[0]?.isCommand,
          command: results[0]?.command,
          confidence: results[0]?.confidence,
          hasExtraction: !!results[0]?.extraction,
          traceToken,
        },
        'Translation complete',
      );

      return results;
    } catch (error) {
      this.logger.error(
        {
          error,
          messageText: messageText.substring(0, 100),
          channelId,
          promptId,
          traceToken,
        },
        'Translation error',
      );

      // Return safe fallback response
      return [
        {
          isCommand: false,
          command: CommandEnum.NONE,
          confidence: 0,
          reason: `Error: ${
            error instanceof Error ? error.message : 'Unknown error'
          }`,
          extraction: null,
        },
      ];
    }
  }

  // Map of command-specific extraction functions
  private readonly extractors = new Map<
    CommandEnum,
    (result: AIResponse[number]) => TranslationResult
  >([
    [
      CommandEnum.LONG,
      (r) =>
        this.mapTradeCommand(
          r as Extract<AIResponse[number], { command: CommandEnum.LONG }>,
        ),
    ],
    [
      CommandEnum.SHORT,
      (r) =>
        this.mapTradeCommand(
          r as Extract<AIResponse[number], { command: CommandEnum.SHORT }>,
        ),
    ],
    [
      CommandEnum.SET_TP_SL,
      (r) =>
        this.mapSetTPSLCommand(
          r as Extract<AIResponse[number], { command: CommandEnum.SET_TP_SL }>,
        ),
    ],
    [
      CommandEnum.CLOSE_ALL,
      (r) =>
        this.mapSymbolOnlyCommand(
          r as Extract<AIResponse[number], { command: CommandEnum.CLOSE_ALL }>,
        ),
    ],
    [
      CommandEnum.CANCEL,
      (r) =>
        this.mapSymbolOnlyCommand(
          r as Extract<AIResponse[number], { command: CommandEnum.CANCEL }>,
        ),
    ],
    [
      CommandEnum.MOVE_SL,
      (r) =>
        this.mapSymbolOnlyCommand(
          r as Extract<AIResponse[number], { command: CommandEnum.MOVE_SL }>,
        ),
    ],
    [
      CommandEnum.CLOSE_BAD_POSITION,
      (r) =>
        this.mapSymbolOnlyCommand(
          r as Extract<
            AIResponse[number],
            { command: CommandEnum.CLOSE_BAD_POSITION }
          >,
        ),
    ],
    [
      CommandEnum.LIMIT_EXECUTED,
      (r) =>
        this.mapSymbolOnlyCommand(
          r as Extract<
            AIResponse[number],
            { command: CommandEnum.LIMIT_EXECUTED }
          >,
        ),
    ],
    [
      CommandEnum.NONE,
      (r) =>
        this.mapNoneCommand(
          r as Extract<AIResponse[number], { command: CommandEnum.NONE }>,
        ),
    ],
  ]);

  private standardliseResponse(
    translationResults: AIResponse,
  ): TranslationResult[] {
    return translationResults.map((result) => this.mapSingleResult(result));
  }

  /**
   * Map a single AI response to TranslationResult
   * Uses command-specific extractors for type safety
   */
  private mapSingleResult(result: AIResponse[number]): TranslationResult {
    const extractor = this.extractors.get(result.command);
    if (!extractor) {
      throw new Error(`Unknown command type: ${result.command}`);
    }
    return extractor(result);
  }

  /**
   * Extract base fields common to all extractions
   */
  private extractBase(extraction: {
    symbol: string;
    side?: CommandSide;
    isImmediate: boolean;
    validationError?: string;
  }) {
    return {
      symbol: extraction.symbol.toUpperCase(),
      side: extraction.side,
      isImmediate: extraction.isImmediate,
      validationError:
        extraction.validationError === '' ||
        extraction.validationError?.length > 0
          ? extraction.validationError
          : undefined,
    };
  }

  /**
   * Map LONG/SHORT commands (trade commands with full extraction)
   */
  private mapTradeCommand(
    result: Extract<AIResponse[number], { command: 'LONG' | 'SHORT' }>,
  ): TranslationResult {
    return {
      reason: result.reason,
      command: result.command as CommandEnum,
      isCommand: result.isCommand,
      confidence: result.confidence,
      extraction: {
        ...this.extractBase(result.extraction),
        meta: result.extraction.meta,
        entry: result.extraction.entry,
        entryZone: result.extraction.entryZone ?? [],
        stopLoss: result.extraction.stopLoss,
        takeProfits: result.extraction.takeProfits ?? [],
      },
    };
  }

  /**
   * Map SET_TP_SL command
   */
  private mapSetTPSLCommand(
    result: Extract<AIResponse[number], { command: 'SET_TP_SL' }>,
  ): TranslationResult {
    return {
      reason: result.reason,
      command: result.command as CommandEnum,
      isCommand: result.isCommand,
      confidence: result.confidence,
      extraction: {
        ...this.extractBase(result.extraction),
        stopLoss: result.extraction.stopLoss,
        takeProfits: result.extraction.takeProfits ?? [],
        entryZone: [],
      },
    };
  }

  /**
   * Map symbol-only commands (CLOSE_ALL, CANCEL, MOVE_SL, CLOSE_BAD_POSITION, LIMIT_EXECUTED)
   */
  private mapSymbolOnlyCommand(
    result: Extract<
      AIResponse[number],
      {
        command:
          | 'CLOSE_ALL'
          | 'CANCEL'
          | 'MOVE_SL'
          | 'CLOSE_BAD_POSITION'
          | 'LIMIT_EXECUTED';
      }
    >,
  ): TranslationResult {
    return {
      reason: result.reason,
      command: result.command as CommandEnum,
      isCommand: result.isCommand,
      confidence: result.confidence,
      extraction: {
        ...this.extractBase(result.extraction),
        entryZone: [],
        takeProfits: [],
      },
    };
  }

  /**
   * Map NONE command (no extraction)
   */
  private mapNoneCommand(
    result: Extract<AIResponse[number], { command: 'NONE' }>,
  ): TranslationResult {
    return {
      reason: result.reason,
      command: result.command as CommandEnum,
      isCommand: result.isCommand,
      confidence: result.confidence,
      extraction: undefined,
    };
  }
}
