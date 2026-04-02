/**
 * Message type enum for stream messages
 */
export enum MessageType {
  /**
   * Use as step one of our chain of steps to process the telegram message.
   * Publisher: telegram-service
   * Consumer: trade-manager
   */
  NEW_MESSAGE = 'NEW_MESSAGE',
  /**
   * Request to translate Telegram message text to trading commands.
   * Publisher: trade-manager
   * Consumer: interpret-service
   */
  TRANSLATE_MESSAGE_REQUEST = 'TRANSLATE_MESSAGE_REQUEST',
  /**
   * Result of message translation with structured commands.
   * Publisher: interpret-service
   * Consumer: trade-manager
   */
  TRANSLATE_MESSAGE_RESULT = 'TRANSLATE_MESSAGE_RESULT',
  /**
   * Request to fetch latest price for a symbol.
   * Publisher: trade-manager
   * Consumer: trade-executor
   */
  SYMBOL_FETCH_LATEST_PRICE = 'SYMBOL_FETCH_LATEST_PRICE',
  /**
   * Request to execute an order on a broker exchange.
   * Publisher: trade-manager
   * Consumer: executor-service
   */
  EXECUTE_ORDER_REQUEST = 'EXECUTE_ORDER_REQUEST',
  /**
   * Result of order execution from executor-service.
   * Publisher: executor-service
   * Consumer: trade-manager
   */
  EXECUTE_ORDER_RESULT = 'EXECUTE_ORDER_RESULT',
  /**
   * Live price update from executor-service.
   * Publisher: executor-service
   * Consumer: trade-manager
   */
  LIVE_PRICE_UPDATE = 'LIVE_PRICE_UPDATE',
}
