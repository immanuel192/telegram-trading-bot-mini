/**
 * Purpose: Define command enum for trading commands
 * Exports: CommandEnum matching AI response schema
 * Core Flow: Used in TRANSLATE_MESSAGE_RESULT payload and AI response validation
 */

/**
 * Indicate the side of the command, whether it is buy or sell
 */
export enum CommandSide {
  /** BUY: Open long position */
  BUY = 'BUY',
  /** SELL: Open short position */
  SELL = 'SELL',
}

/**
 * Trading command types
 * Must match exactly with gemini-response-schema.ts command enum
 */
export enum CommandEnum {
  /** LONG: Open long position */
  LONG = 'LONG',
  /** SHORT: Open short position */
  SHORT = 'SHORT',
  /** MOVE_SL: Move stop loss to entry */
  MOVE_SL = 'MOVE_SL',
  /** SET_TP_SL: Update TP/SL */
  SET_TP_SL = 'SET_TP_SL',
  /** CLOSE_BAD_POSITION: Close less profitable positions */
  CLOSE_BAD_POSITION = 'CLOSE_BAD_POSITION',
  /** CLOSE_ALL: Close all positions */
  CLOSE_ALL = 'CLOSE_ALL',
  /** CLOSE_PARTIAL: Close a portion of the position */
  CLOSE_PARTIAL = 'CLOSE_PARTIAL',
  /** CANCEL: Cancel pending orders */
  CANCEL = 'CANCEL',
  /** LIMIT_EXECUTED: Report when limit order is hit */
  LIMIT_EXECUTED = 'LIMIT_EXECUTED',
  /** NONE: Not a command */
  NONE = 'NONE',
}
