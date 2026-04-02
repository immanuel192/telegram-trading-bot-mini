/**
 * Purpose: Groq AI service implementation for message translation
 * Exports: GroqAIService class
 * Core Flow: Stateless AI service using Groq API with JSON structured output
 *
 * Key Differences from Gemini:
 * - No session management (stateless)
 * - Configurable model (default: llama-3.1-8b-instant)
 * - Auto-detects json_schema support based on model
 * - Token usage tracked via Sentry metrics
 * - No rate limiting needed (Developer plan: 1K RPM)
 */

import Groq from 'groq-sdk';
import { CompletionCreateParams } from 'groq-sdk/resources/chat/completions';
import { Logger } from 'pino';
import type { IAIService, MessageContext } from '../../ai-service.interface';
import type { TranslationResult } from '../../types';
import { GROQ_RESPONSE_SCHEMA } from './groq-response-schema';
import { generateSampleResponse } from '../../schemas/schema-doc-generator';
import type { PromptCacheService } from '../../../prompt-cache.service';
import {
  CommandEnum,
  gaugeMetric,
} from '@telegram-trading-bot-mini/shared/utils';
import * as Sentry from '@sentry/node';
import { AIResponse, AIResponseSchema } from '../../schemas/ai-response.schema';

/**
 * Models that support strict JSON schema enforcement (json_schema mode)
 * Source: https://console.groq.com/docs/structured-outputs#supported-models
 */
const JSON_SCHEMA_SUPPORTED_MODELS = [
  'openai/gpt-oss-20b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-safeguard-20b',
  'moonshotai/kimi-k2-instruct-0905',
  // 'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
];

/**
 * Groq AI Service - Stateless implementation
 *
 * Supports multiple Groq models with automatic json_schema detection.
 * No session caching - each request is independent.
 */
export class GroqAIService implements IAIService {
  private client: Groq;
  private readonly model: string;
  private readonly fallbackModel: string;
  private readonly supportsJsonSchema: boolean;
  private readonly fallbackSupportsJsonSchema: boolean;

  constructor(
    readonly apiKey: string,
    model: string,
    fallbackModel: string,
    private readonly promptCacheService: PromptCacheService,
    private readonly logger: Logger,
  ) {
    this.client = new Groq({ apiKey });
    this.model = model;
    this.fallbackModel = fallbackModel;
    this.supportsJsonSchema = JSON_SCHEMA_SUPPORTED_MODELS.includes(model);
    this.fallbackSupportsJsonSchema =
      JSON_SCHEMA_SUPPORTED_MODELS.includes(fallbackModel);

    // Warn if fallback model has degraded capabilities
    if (this.supportsJsonSchema && !this.fallbackSupportsJsonSchema) {
      this.logger.warn(
        {
          primary: this.model,
          fallback: this.fallbackModel,
        },
        'Fallback model does not support JSON schema - may have degraded accuracy',
      );
    }

    this.logger.info(
      {
        model: this.model,
        fallbackModel: this.fallbackModel,
        jsonSchemaSupport: this.supportsJsonSchema,
        fallbackJsonSchemaSupport: this.fallbackSupportsJsonSchema,
      },
      'GroqAIService initialized with fallback support',
    );
  }

  /**
   * Return the system prompt with schema documentation injected via cache service
   * @param promptId
   * @returns
   */
  private async getSystemPrompt(promptId: string) {
    // Determine schema documentation based on model capabilities
    let schemaDoc: string | undefined;

    if (!this.supportsJsonSchema) {
      // For non-schema models, provide full schema documentation
      schemaDoc = `**Response structure: You MUST respond with valid JSON matching this exact structure:**\n\n${generateSampleResponse()}\n\n**Do not include any text outside the JSON array.**`;
    } else {
      // For schema-supported models, provide brief note (schema is enforced via json_schema)
      schemaDoc = '**Note: Response format is enforced by JSON schema.**';
    }

    // Fetch prompt with placeholder replaced and cached
    const cachedPrompt = await this.promptCacheService.getPrompt(
      promptId,
      schemaDoc,
    );

    if (!cachedPrompt.systemPrompt) {
      throw new Error('Failed to fetch system prompt');
    }

    return cachedPrompt.systemPrompt;
  }

  /**
   * Execute a translation request to Groq API with specified model
   * Extracted for reuse in primary and fallback requests
   *
   * @param model - Model to use for the request
   * @param systemPrompt - System prompt
   * @param userMessage - User message
   * @param supportsJsonSchema - Whether the model supports JSON schema
   * @returns Groq completion response
   */
  private async executeTranslationRequest(
    model: string,
    systemPrompt: string,
    userMessage: string,
    supportsJsonSchema: boolean,
  ) {
    // Determine response format based on model capabilities
    const responseFormat = supportsJsonSchema
      ? ({
          type: 'json_schema',
          json_schema: {
            name: 'translation_result',
            schema: GROQ_RESPONSE_SCHEMA,
            strict: true,
          },
        } as CompletionCreateParams.ResponseFormatJsonSchema)
      : undefined; // Don't use json_object - it forces single objects, not arrays

    // Make API call to Groq
    return await this.client.chat.completions.create({
      model,
      messages: [
        {
          role: 'system',
          content: systemPrompt,
        },
        {
          role: 'user',
          content: userMessage,
        },
      ],
      response_format: responseFormat,
      temperature: 0, // Deterministic
      presence_penalty: 0,
      frequency_penalty: 0,
      top_p: 1,
    });
  }

  /**
   * Translate a Telegram message into structured trading commands
   *
   * @param messageText - The raw message text to translate
   * @param context - Surrounding messages for context
   * @param channelId - Channel identifier (for metrics)
   * @param promptId - Prompt rule identifier
   * @param traceToken - Optional trace token for request tracking
   * @returns Translation result with classification and optional extraction
   */
  async translateMessage(
    messageText: string,
    context: MessageContext,
    channelId: string,
    promptId: string,
    traceToken?: string,
  ): Promise<TranslationResult[]> {
    const startTime = Date.now();

    try {
      const systemPrompt = await this.getSystemPrompt(promptId).catch((err) => {
        this.logger.error(
          { channelId, promptId, traceToken },
          'Failed to fetch system prompt from cache',
        );
        throw err;
      });

      // Normalize to lowercase for case-insensitive matching
      // This ensures "TP", "tp", "Tp" are all treated the same
      const userMessage = JSON.stringify(
        {
          message: messageText.toLowerCase(),
          prevMessage: (context.prevMessage || '').toLowerCase(),
          quotedMessage: context.quotedMessage?.toLowerCase() || '',
          quotedFirstMessage: context.quotedFirstMessage?.toLowerCase() || '',
        },
        null,
        2,
      );

      // console.log(userMessage);

      // Make API call to Groq with fallback support
      let completion;
      let modelUsed = this.model;
      let fallbackAttempted = false;

      try {
        completion = await this.executeTranslationRequest(
          this.model,
          systemPrompt,
          userMessage,
          this.supportsJsonSchema,
        );
      } catch (primaryError: any) {
        // Check if error is 503 (over capacity)
        if (primaryError?.status === 503) {
          this.logger.warn(
            {
              channelId,
              promptId,
              traceToken,
              primaryModel: this.model,
              fallbackModel: this.fallbackModel,
              error: primaryError.message,
            },
            'Primary model over capacity (503), attempting fallback',
          );

          fallbackAttempted = true;
          const fallbackStartTime = Date.now();

          try {
            // Retry with fallback model
            completion = await this.executeTranslationRequest(
              this.fallbackModel,
              systemPrompt,
              userMessage,
              this.fallbackSupportsJsonSchema,
            );

            modelUsed = this.fallbackModel;
            const fallbackDuration = Date.now() - fallbackStartTime;

            // Track successful fallback
            gaugeMetric('ai.groq.fallback.success', 1, {
              primaryModel: this.model,
              fallbackModel: this.fallbackModel,
              channelId,
              promptId,
            });

            gaugeMetric('ai.groq.fallback.latency', fallbackDuration, {
              primaryModel: this.model,
              fallbackModel: this.fallbackModel,
              channelId,
              promptId,
            });

            this.logger.info(
              {
                channelId,
                promptId,
                traceToken,
                fallbackModel: this.fallbackModel,
                fallbackDuration,
              },
              'Fallback model succeeded',
            );
          } catch (fallbackError: any) {
            // Both primary and fallback failed
            gaugeMetric('ai.groq.fallback.failure', 1, {
              primaryModel: this.model,
              fallbackModel: this.fallbackModel,
              channelId,
              promptId,
              errorStatus: fallbackError?.status || 'unknown',
            });

            this.logger.error(
              {
                channelId,
                promptId,
                traceToken,
                primaryError: primaryError.message,
                fallbackError: fallbackError.message,
                fallbackStatus: fallbackError?.status,
              },
              'Both primary and fallback models failed',
            );

            // Re-throw the fallback error
            throw fallbackError;
          }
        } else {
          // Non-503 error, don't attempt fallback
          throw primaryError;
        }
      }

      const duration = Date.now() - startTime;
      const responseText = completion.choices[0]?.message?.content || '[]';
      // console.log(responseText);

      // Track token usage via Sentry metrics
      const usage = completion.usage;
      if (usage) {
        gaugeMetric('ai.groq.tokens.prompt', usage.prompt_tokens || 0, {
          model: modelUsed,
          channelId,
          promptId,
        });
        gaugeMetric('ai.groq.tokens.completion', usage.completion_tokens || 0, {
          model: modelUsed,
          channelId,
          promptId,
        });
        gaugeMetric('ai.groq.tokens.total', usage.total_tokens || 0, {
          model: modelUsed,
          channelId,
          promptId,
        });
      }

      gaugeMetric('ai.groq.latency', duration, {
        model: modelUsed,
        channelId,
        promptId,
        fallbackUsed: fallbackAttempted,
      });

      // Parse JSON response
      let results: TranslationResult[];
      try {
        // console.log(responseText);
        results = this.standardliseResponse(JSON.parse(responseText));
      } catch (parseError) {
        this.logger.error(
          {
            channelId,
            promptId,
            traceToken,
            responseText,
            error: parseError,
          },
          'Failed to parse Groq JSON response',
        );

        Sentry.captureException(parseError, {
          tags: {
            service: 'groq-ai',
            model: this.model,
            channelId,
            promptId,
          },
          extra: {
            responseText,
            traceToken,
          },
        });

        return [this.createErrorResponse('Failed to parse AI response')];
      }

      this.logger.debug(
        {
          channelId,
          promptId,
          traceToken,
          duration,
          commandCount: results.length,
          isCommand: results[0]?.isCommand,
          command: results[0]?.command,
          confidence: results[0]?.confidence,
          tokens: usage?.total_tokens,
        },
        'Groq translation completed',
      );

      return results;
    } catch (error: any) {
      const duration = Date.now() - startTime;

      this.logger.error(
        {
          channelId,
          promptId,
          traceToken,
          duration,
          error: error.message,
          status: error.status,
        },
        'Groq API error',
      );

      // Capture to Sentry
      Sentry.captureException(error, {
        tags: {
          service: 'groq-ai',
          model: this.model,
          channelId,
          promptId,
        },
        extra: {
          traceToken,
          duration,
          status: error.status,
        },
      });

      // Check for rate limit (shouldn't happen with Developer plan, but handle it)
      if (error?.status === 429 || error?.message?.includes('rate limit')) {
        this.logger.warn(
          { channelId, promptId, traceToken },
          'Groq rate limit hit (unexpected with Developer plan)',
        );
        return [this.createErrorResponse('Rate limit exceeded')];
      }

      return [this.createErrorResponse(`Error: ${error.message}`)];
    }
  }

  // Map of command-specific extraction functions
  private readonly extractors = new Map<
    string,
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
        this.mapMoveSLCommand(
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

  /**
   * Standardize AI response to always return an array
   * Handles backward compatibility: if AI returns single object, wrap it in array
   */
  private standardliseResponse(
    translationResults: AIResponse,
  ): TranslationResult[] {
    // If AI returned a single object instead of array, wrap it
    if (!Array.isArray(translationResults)) {
      this.logger.warn(
        { response: translationResults },
        'AI returned single object instead of array - wrapping in array for backward compatibility',
      );
      return [this.mapSingleResult(translationResults)];
    }

    // Normal case: AI returned an array
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
   * Convert null to undefined (AI returns null, but TypeBox expects undefined)
   */
  private nullToUndefined<T>(value: T | null): T | undefined {
    return value === null ? undefined : value;
  }

  /**
   * Extract base fields common to all extractions
   * Converts null to undefined for TypeBox Optional compatibility
   */
  private extractBase(extraction: {
    symbol: string;
    isImmediate: boolean;
    validationError?: string | null;
  }) {
    return {
      symbol: extraction.symbol.toUpperCase(),
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
      // with LONG/SHORT, regardless returned from AI, this is always a command
      isCommand: true,
      confidence: result.confidence,
      extraction: {
        ...this.extractBase(result.extraction),
        side: this.nullToUndefined(result.extraction.side),
        meta: result.extraction.meta,
        entry: this.nullToUndefined(result.extraction.entry),
        entryZone: result.extraction.entryZone ?? [],
        stopLoss: this.nullToUndefined(result.extraction.stopLoss),
        takeProfits: result.extraction.takeProfits ?? [],
        isLinkedWithPrevious: this.nullToUndefined(
          result.extraction.isLinkedWithPrevious,
        ),
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
        // side: this.nullToUndefined(result.extraction.side),
        stopLoss: this.nullToUndefined(result.extraction.stopLoss),
        takeProfits: result.extraction.takeProfits ?? [],
        entryZone: [],
      },
    };
  }

  /**
   * Map MOVE_SL command
   */
  private mapMoveSLCommand(
    result: Extract<AIResponse[number], { command: 'MOVE_SL' }>,
  ): TranslationResult {
    return {
      reason: result.reason,
      command: result.command as CommandEnum,
      isCommand: result.isCommand,
      confidence: result.confidence,
      extraction: {
        ...this.extractBase(result.extraction),
        side: this.nullToUndefined(result.extraction.side),
        stopLoss: this.nullToUndefined(result.extraction.stopLoss),
        entryZone: [],
        takeProfits: [],
      },
    };
  }

  /**
   * Map symbol-only commands (CLOSE_ALL, CANCEL, CLOSE_BAD_POSITION, LIMIT_EXECUTED)
   */
  private mapSymbolOnlyCommand(
    result: Extract<
      AIResponse[number],
      {
        command:
          | 'CLOSE_ALL'
          | 'CANCEL'
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
        side: this.nullToUndefined(result.extraction.side),
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
      // with NONE, regardless returned from AI, this is not a command
      isCommand: false,
      confidence: result.confidence,
      extraction: {
        symbol: result.extraction.symbol.toUpperCase(),
        isImmediate: true, // Always true for NONE commands
        side: undefined,
        validationError: this.nullToUndefined(
          result.extraction.validationError,
        ),
      },
    };
  }

  /**
   * Create error response when AI call fails
   */
  private createErrorResponse(reason: string): TranslationResult {
    return {
      isCommand: false,
      command: CommandEnum.NONE,
      confidence: 0,
      reason,
      extraction: undefined,
    };
  }
}
