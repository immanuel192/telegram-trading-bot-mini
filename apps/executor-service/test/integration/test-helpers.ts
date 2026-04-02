/**
 * Shared test helpers for OrderExecutorService integration tests
 * Provides common utilities for creating test accounts and orders
 */

import { createTestAccount } from '@telegram-trading-bot-mini/shared/test-utils';
import { orderRepository } from '@dal';
import {
  Order,
  OrderStatus,
  OrderSide,
  OrderExecutionType,
  TradeType,
} from '@dal/models';
import { ServerContext } from '../../src/server';

/**
 * Helper to create test account with mock broker
 */
export async function createMockAccount(
  serverContext: ServerContext,
  accountId: string,
  overrides?: Parameters<typeof createTestAccount>[0],
) {
  const account = createTestAccount({
    accountId,
    brokerConfig: {
      exchangeCode: 'mock',
      apiKey: 'test-api-key',
    },
    ...overrides,
  });

  await serverContext.container.accountRepository.create(account);
  return account;
}

/**
 * Helper to create test order
 */
export async function createOrder(order: Partial<Order>) {
  await orderRepository.create({
    accountId: 'test-account',
    orderId: 'test-order-1',
    messageId: 100,
    channelId: 'channel-1',
    status: OrderStatus.PENDING,
    side: OrderSide.LONG,
    executionType: OrderExecutionType.market,
    tradeType: TradeType.FUTURE,
    symbol: 'BTCUSD',
    lotSize: 0.1,
    createdAt: new Date(),
    history: [],
    ...order,
  } as any);
}
