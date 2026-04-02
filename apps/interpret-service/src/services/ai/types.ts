/**
 * Purpose: Define INTERNAL types for AI service responses (post-transformation).
 * Exports: TranslationResult - the normalized type used throughout the application.
 * Core Flow: AI Response → Provider Transform → TranslationResult (this file)
 *
 * IMPORTANT: This is NOT the AI schema - it's the internal application type.
 *
 * Architecture:
 * - AI schemas are in schemas/ai-response.schema.ts (TypeBox for validation)
 * - Provider-specific schemas are in providers/[provider]/schema files
 * - Each provider transforms their response to match TranslationResult via standardliseResponse()
 *
 * Why separate?
 * - Future-proof: AI providers may change response formats
 * - Flexibility: Different providers can have different raw formats
 * - Stability: Application code uses stable TranslationResult type
 */

import {
  CommandEnum,
  CommandSide,
} from '@telegram-trading-bot-mini/shared/utils';

/**
 * Take profit level with price or pips
 */
export interface TakeProfitLevel {
  /** Target price for take profit */
  price?: number;
  /** Take profit distance in pips (alternative to price) */
  pips?: number;
}

/**
 * Stop loss level with price or pips
 * Similar to TakeProfitLevel - supports both absolute price and relative pips
 */
export interface StopLossLevel {
  /** Absolute stop loss price */
  price?: number;
  /** Stop loss distance in pips from entry */
  pips?: number;
}

/**
 * Meta information for commands
 */
export interface ExtractionMeta {
  /** Whether to reduce the lot size */
  reduceLotSize?: boolean | null;
  /** Whether to slightly adjust the entry price */
  adjustEntry?: boolean | null;
}

/**
 * Extraction data from AI response (normalized structure)
 * Contains trading-specific fields extracted from the message
 */
export interface AIExtraction {
  /** Trading symbol (e.g., "XAUUSD", "EURUSD") */
  symbol: string;
  /** Trading side (buy or sell) */
  side?: CommandSide;
  /** Whether to execute immediately at market price */
  isImmediate: boolean;
  /** Extra metadata for the command */
  meta?: ExtractionMeta;
  /** Exact entry price (null if entryZone is used) */
  entry?: number;
  /** Entry price range [min, max] (null if exact entry is used) */
  entryZone?: number[];
  /** Stop loss (price or pips) */
  stopLoss?: StopLossLevel;
  /** Take profit levels */
  takeProfits?: TakeProfitLevel[];
  /** Whether this order should link with the previous order of the same account */
  isLinkedWithPrevious?: boolean | null;
  /** Validation error if extraction had issues */
  validationError?: string;
}

/**
 * Translation Result - Normalized AI Response Structure
 *
 * This is the INTERNAL type used throughout the application after provider transformation.
 * Each AI provider (Groq, Gemini, etc.) transforms their raw response to match this structure.
 *
 * Example responses:
 *
 * Command detected:
 * {
 *   "isCommand": true,
 *   "command": "LONG",
 *   "confidence": 0.95,
 *   "reason": "Clear buy signal",
 *   "extraction": { symbol: "XAUUSD", isImmediate: false, ... }
 * }
 *
 * Non-command:
 * {
 *   "isCommand": false,
 *   "command": "NONE",
 *   "confidence": 0.9,
 *   "reason": "Just a greeting",
 *   "extraction": null
 * }
 */
export interface TranslationResult {
  /** Whether the message is a trading command */
  isCommand: boolean;
  /**
   * Type of command detected - uses CommandEnum for consistency.
   * See libs/shared/utils/src/interfaces/messages/command-enum.ts for all values.
   *
   */
  command: CommandEnum;
  /** AI confidence score (0-1) */
  confidence: number;
  /** AI's reasoning for the classification */
  reason: string;
  /** Extraction data (only present if isCommand is true, undefined otherwise) */
  extraction?: AIExtraction;
}
