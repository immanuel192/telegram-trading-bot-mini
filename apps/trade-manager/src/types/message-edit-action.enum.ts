/**
 * Actions to take when a message edit is detected
 *
 * When a Telegram message is edited after an order has been placed,
 * the system must determine the appropriate corrective action based
 * on what changed in the message.
 */
export enum MessageEditAction {
  /**
   * Close OPEN orders and create new ones
   * Triggered when: side changed (BUY ↔ SELL) or symbol changed
   */
  CLOSE_AND_RECREATE = 'CLOSE_AND_RECREATE',

  /**
   * Cancel PENDING orders and create new ones
   * Triggered when: entry price, side, or symbol changed for pending orders
   */
  CANCEL_AND_RECREATE = 'CANCEL_AND_RECREATE',

  /**
   * Update TP/SL on existing OPEN orders
   * Triggered when: only TP/SL values changed (same side, symbol, entry)
   */
  UPDATE_TP_SL = 'UPDATE_TP_SL',

  /**
   * No action needed
   * Triggered when: insignificant changes that don't affect trading logic
   */
  IGNORE = 'IGNORE',
}
