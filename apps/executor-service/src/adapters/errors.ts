/**
 * Purpose: Standardized error classes for broker adapters
 * Exports: OrderNotFoundError
 * Core Flow: Thrown by adapters when order/trade doesn't exist on exchange
 */

/**
 * Error thrown when attempting to operate on an order that doesn't exist on the exchange.
 * This can happen when:
 * - Order was manually closed
 * - Order was closed by TP/SL trigger
 * - Order was already cancelled
 */
export class OrderNotFoundError extends Error {
  constructor(public orderId: string, public rawResponse?: any) {
    super(
      `Order not found: ${orderId}${
        rawResponse ? ' - Response: ' + JSON.stringify(rawResponse) : ''
      }`
    );
    this.name = 'OrderNotFoundError';
  }
}
