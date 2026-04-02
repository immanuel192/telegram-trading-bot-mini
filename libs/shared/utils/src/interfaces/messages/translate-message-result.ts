/**
 * Purpose: Define TRANSLATE_MESSAGE_RESULT message type for returning translation results.
 * Exports: TranslateMessageResultPayload type, TypeBox schemas.
 * Core Flow: interpret-service publishes AI response as-is → trade-manager consumes → translates to internal actions.
 *
 * IMPORTANT: This schema now matches the AI response schema exactly (from gemini-response-schema.ts).
 * The AI response is published directly without transformation.
 */

import { Type, Static } from '@sinclair/typebox';
import { CommandEnum, CommandSide } from './command-enum';

/**
 * TypeBox schema for TRANSLATE_MESSAGE_RESULT payload validation
 * Aligned with AI response schema from gemini-response-schema.ts
 */
export const TranslateMessageResultPayloadSchema = Type.Object({
  /**
   * Prompt rule ID that was used for this translation
   * References the PromptRule document used in the AI translation
   */
  promptId: Type.String({ minLength: 1 }),
  /**
   * Trace token for tracking this message across services
   * Format: {messageId}{channelId}
   */
  traceToken: Type.String({ minLength: 1 }),
  /**
   * Timestamp when telegram-service originally received the message (milliseconds since epoch)
   * Forwarded from NEW_MESSAGE → TRANSLATE_MESSAGE_REQUEST → TRANSLATE_MESSAGE_RESULT
   * Used for calculating end-to-end processing duration in trade-manager
   */
  receivedAt: Type.Integer({ minimum: 1 }),
  /**
   * Original message ID
   */
  messageId: Type.Integer({ minimum: 1 }),
  /**
   * Original channel ID
   */
  channelId: Type.String({ minLength: 1 }),

  /**
   * Array of AI-detected commands in this message.
   * Each command contains full classification and extraction data.
   * Minimum 1 command required (even if it's a NONE command).
   */
  commands: Type.Array(
    Type.Object({
      /**
       * Whether this is a trading command
       */
      isCommand: Type.Boolean(),
      /**
       * Type of command
       */
      command: Type.Enum(CommandEnum),
      /**
       * AI confidence score (0-1)
       */
      confidence: Type.Number({ minimum: 0, maximum: 1 }),
      /**
       * AI's reasoning for the classification
       */
      reason: Type.String(),
      /**
       * Extraction data (only present if isCommand is true)
       */
      extraction: Type.Optional(
        Type.Object({
          symbol: Type.Optional(Type.String()),
          side: Type.Optional(
            Type.Union([
              Type.Literal(CommandSide.BUY),
              Type.Literal(CommandSide.SELL),
            ])
          ),
          isImmediate: Type.Optional(Type.Boolean()),
          meta: Type.Optional(
            Type.Object({
              reduceLotSize: Type.Optional(Type.Boolean()),
              adjustEntry: Type.Optional(Type.Boolean()),
            })
          ),
          entry: Type.Optional(Type.Number()),
          entryZone: Type.Optional(Type.Array(Type.Number())),
          stopLoss: Type.Optional(
            Type.Object({
              price: Type.Optional(Type.Number()),
              pips: Type.Optional(Type.Number()),
            })
          ),
          takeProfits: Type.Optional(
            Type.Array(
              Type.Object({
                price: Type.Optional(Type.Number()),
                pips: Type.Optional(Type.Number()),
              })
            )
          ),
          isLinkedWithPrevious: Type.Optional(Type.Boolean()),
          validationError: Type.Optional(Type.String()),
        })
      ),
    }),
    { minItems: 1 }
  ),
});

/**
 * Payload type for TRANSLATE_MESSAGE_RESULT
 */
export type TranslateMessageResultPayload = Static<
  typeof TranslateMessageResultPayloadSchema
>;
