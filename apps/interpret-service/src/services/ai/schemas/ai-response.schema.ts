/**
 * Purpose: Unified AI response schema using TypeBox with discriminated unions
 * Exports: AIResponseSchema (TypeBox), AIResponse (TypeScript discriminated union)
 * Core Flow: Define discriminated union → Flatten for AI → Type-safe handling
 *
 * This schema uses discriminated unions for TypeScript type safety while
 * flattening to a simple schema for AI consumption.
 *
 * Benefits:
 * - Discriminated union types for compile-time safety
 * - Command-specific required fields
 * - Flattens to simple schema for AI
 * - Prompt controls AI behavior
 */

import { Type, Static } from '@sinclair/typebox';
import {
  CommandEnum,
  CommandSide,
} from '@telegram-trading-bot-mini/shared/utils';

/**
 * Take profit level schema
 */
const TakeProfitSchema = Type.Object({
  price: Type.Optional(
    Type.Number({ description: 'Target price. Default is undefined.' }),
  ),
  pips: Type.Optional(
    Type.Number({
      description: 'Take profit distance in pips. Default is undefined.',
    }),
  ),
});

/**
 * Stop loss schema
 * Similar to TakeProfitSchema - supports both absolute price and relative pips
 */
const StopLossSchema = Type.Object({
  price: Type.Optional(
    Type.Number({
      description: 'Absolute stop loss price. Default is undefined.',
    }),
  ),
  pips: Type.Optional(
    Type.Number({
      description:
        'Stop loss distance in pips from entry. Default is undefined.',
    }),
  ),
});

/**
 * Meta information schema
 */
const MetaSchema = Type.Object(
  {
    reduceLotSize: Type.Optional(
      Type.Boolean({
        description: 'Whether to reduce the lot size. Default is false.',
      }),
    ),
    adjustEntry: Type.Optional(
      Type.Boolean({
        description:
          'Whether the command indicate to slightly adjust the entry price. Default is false.',
      }),
    ),
  },
  { description: 'Extra information for the command, default empty object' },
);

/**
 * Base response fields shared by all commands
 */
const BaseResponseSchema = Type.Object({
  isCommand: Type.Boolean({
    description: 'Whether the message is a trading command',
  }),
  confidence: Type.Number({ description: 'AI confidence score (0-1)' }),
  reason: Type.String({
    description:
      'Long and detail explain why and how did you extract the symbol name',
  }),
});

/**
 * Base extraction schema
 * Common fields for all commands that have extraction
 */
const BaseExtractionSchema = Type.Object({
  symbol: Type.String({
    description: 'Trading symbol (e.g., EURUSD, BTCUSDT, XAUUSD)',
  }),
  side: Type.Optional(
    Type.Union(
      [Type.Literal(CommandSide.BUY), Type.Literal(CommandSide.SELL)],
      {
        description: 'Trading side: BUY for LONG, SELL for SHORT',
      },
    ),
  ),
  isImmediate: Type.Boolean({
    description: 'Whether to execute immediately at market price',
  }),
  validationError: Type.Optional(
    Type.String({ description: 'Validation error if extraction failed' }),
  ),
});

/**
 * Extraction schema for LONG/SHORT commands
 * Extends base with trade-specific fields
 */
const TradeExtractionSchema = Type.Object({
  ...BaseExtractionSchema.properties,
  meta: Type.Optional(MetaSchema),
  entry: Type.Optional(
    Type.Number({
      description: 'Exact entry price (undefined if entryZone is used)',
    }),
  ),
  entryZone: Type.Optional(
    Type.Array(Type.Number(), {
      description: 'Entry price range [min, max], ordered ascending',
    }),
  ),
  stopLoss: Type.Optional(StopLossSchema),
  takeProfits: Type.Optional(
    Type.Array(TakeProfitSchema, {
      description: 'Take profit levels',
    }),
  ),
  isLinkedWithPrevious: Type.Optional(
    Type.Boolean({
      description:
        'Whether this order should link with the previous order of the same account. Use this field when we have dual orders. Default is null.',
    }),
  ),
});

/**
 * Extraction schema for symbol-only commands
 * Used by: CLOSE_ALL, CANCEL, CLOSE_BAD_POSITION
 * Only requires base fields (symbol, isImmediate)
 */
const SymbolOnlyExtractionSchema = BaseExtractionSchema;

/**
 * Extraction schema for MOVE_SL command
 * Extends base with optional stopLoss
 */
const MoveSLExtractionSchema = Type.Object({
  ...BaseExtractionSchema.properties,
  stopLoss: Type.Optional(StopLossSchema),
});

/**
 * Extraction schema for SET_TP_SL command
 * Extends base with TP/SL fields
 */
const SetTPSLExtractionSchema = Type.Object({
  ...BaseExtractionSchema.properties,
  stopLoss: Type.Optional(StopLossSchema),
  takeProfits: Type.Optional(
    Type.Array(TakeProfitSchema, {
      description: 'New take profit levels',
    }),
  ),
});

/**
 * LONG/SHORT command schema
 */
const TradeCommandSchema = Type.Object({
  ...BaseResponseSchema.properties,
  command: Type.Union(
    [Type.Literal(CommandEnum.LONG), Type.Literal(CommandEnum.SHORT)],
    {
      description: 'Open a new long or short position',
    },
  ),
  extraction: TradeExtractionSchema,
});

/**
 * CLOSE_ALL command schema
 */
const CloseAllCommandSchema = Type.Object({
  ...BaseResponseSchema.properties,
  command: Type.Literal(CommandEnum.CLOSE_ALL, {
    description: 'Close all positions, including pending orders',
  }),
  extraction: SymbolOnlyExtractionSchema,
});

/**
 * CANCEL command schema
 */
const CancelCommandSchema = Type.Object({
  ...BaseResponseSchema.properties,
  command: Type.Literal(CommandEnum.CANCEL, {
    description: 'Cancel current pending orders',
  }),
  extraction: SymbolOnlyExtractionSchema,
});

/**
 * MOVE_SL command schema
 */
const MoveSLCommandSchema = Type.Object({
  ...BaseResponseSchema.properties,
  command: Type.Literal(CommandEnum.MOVE_SL, {
    description: 'Move the stop loss to entry or specified price',
  }),
  extraction: MoveSLExtractionSchema,
});

/**
 * SET_TP_SL command schema
 */
const SetTPSLCommandSchema = Type.Object({
  ...BaseResponseSchema.properties,
  command: Type.Literal(CommandEnum.SET_TP_SL, {
    description: 'Set/update take profit levels and stop loss',
  }),
  extraction: SetTPSLExtractionSchema,
});

/**
 * CLOSE_BAD_POSITION command schema
 */
const CloseBadPositionCommandSchema = Type.Object({
  ...BaseResponseSchema.properties,
  command: Type.Literal(CommandEnum.CLOSE_BAD_POSITION, {
    description: 'Close a position that is less profitable',
  }),
  extraction: SymbolOnlyExtractionSchema,
});

/**
 * LIMIT_EXECUTED command schema (reports when limit order is hit)
 */
const LimitExecutedCommandSchema = Type.Object({
  ...BaseResponseSchema.properties,
  command: Type.Literal(CommandEnum.LIMIT_EXECUTED, {
    description: 'Report when limit order is hit',
  }),
  extraction: SymbolOnlyExtractionSchema,
});

/**
 * NONE command schema (no extraction)
 */
const NoneCommandSchema = Type.Object({
  ...BaseResponseSchema.properties,
  command: Type.Literal(CommandEnum.NONE, {
    description: 'No command detected',
  }),
  extraction: SymbolOnlyExtractionSchema,
});

/**
 * Complete AI response schema - Array of Discriminated Unions
 * Each command type has its own required fields
 * This will be flattened during conversion for AI simplicity
 * Supports multiple commands per message
 */
export const AIResponseSchema = Type.Array(
  Type.Union(
    [
      TradeCommandSchema,
      CloseAllCommandSchema,
      CancelCommandSchema,
      MoveSLCommandSchema,
      SetTPSLCommandSchema,
      CloseBadPositionCommandSchema,
      LimitExecutedCommandSchema,
      NoneCommandSchema,
    ],
    {
      description: 'AI response with discriminated union based on command type',
    },
  ),
  {
    description: 'Array of AI commands detected in the message',
  },
);

/**
 * TypeScript discriminated union type
 * Provides compile-time type safety based on command value
 */
export type AIResponse = Static<typeof AIResponseSchema>;
