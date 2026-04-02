/**
 * Purpose: Define test cases for adapter verification
 * Exports: Test case definitions and seed data generators
 * Core Flow: Provide predefined payloads and seed data for each command type
 */

import {
  ExecuteOrderRequestPayload,
  CommandEnum,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  Order,
  OrderStatus,
  OrderSide,
  OrderExecutionType,
  TradeType,
  OrderHistoryStatus,
} from '@dal';
import { ObjectId } from 'mongodb';

export interface TestCase {
  id: number;
  name: string;
  description: string;
  command: CommandEnum;
  seedOrders: Partial<Order>[];
  payload: ExecuteOrderRequestPayload;
  expectedDbState: {
    status?: OrderStatus;
    historyCount?: number;
    historyLastStatus?: OrderHistoryStatus;
    checkFields?: string[];
  };
  /**
   * Optional: ID of prerequisite test case that must run first
   * Used when this test depends on data created by another test
   * Example: MOVE_SL requires a LONG order to exist first
   */
  prerequisiteTestCaseId?: number;
}

const BASE_ACCOUNT_ID = 'simulator-account';
const BASE_CHANNEL_ID = 'test-channel';
const BASE_MESSAGE_ID = 1000;
const BASE_SYMBOL = 'XAU_USD';

/**
 * Test Case 1: LONG - Market order with SL/TP
 */
export const testCase1: TestCase = {
  id: 1,
  name: 'LONG - Market Order',
  description: 'Open a LONG position with market execution, SL and TP',
  command: CommandEnum.LONG,
  seedOrders: [
    {
      _id: new ObjectId(),
      orderId: 'test-long-001',
      accountId: BASE_ACCOUNT_ID,
      messageId: BASE_MESSAGE_ID + 1,
      channelId: BASE_CHANNEL_ID,
      status: OrderStatus.PENDING,
      side: OrderSide.LONG,
      executionType: OrderExecutionType.market,
      tradeType: TradeType.GOLD_CFD,
      symbol: BASE_SYMBOL,
      lotSize: 1,
      createdAt: new Date(),
      history: [
        {
          _id: new ObjectId(),
          status: OrderHistoryStatus.INTEND,
          service: 'trade-manager',
          ts: new Date(),
          traceToken: 'trace-long-001',
          messageId: BASE_MESSAGE_ID + 1,
          channelId: BASE_CHANNEL_ID,
          command: CommandEnum.LONG,
        },
      ],
    },
  ],
  payload: {
    orderId: 'test-long-001',
    messageId: BASE_MESSAGE_ID + 1,
    channelId: BASE_CHANNEL_ID,
    accountId: BASE_ACCOUNT_ID,
    traceToken: 'trace-long-001',
    symbol: BASE_SYMBOL,
    command: CommandEnum.LONG,
    lotSize: 1,
    isImmediate: true,
    stopLoss: {
      price: 2600,
    },
    takeProfits: [
      {
        price: 5000,
      },
    ],
    timestamp: Date.now(),
  },
  expectedDbState: {
    status: OrderStatus.OPEN,
    historyCount: 2,
    historyLastStatus: OrderHistoryStatus.OPEN,
    checkFields: [
      'entry.entryOrderId',
      'entry.actualEntryPrice',
      'sl.slOrderId',
      'tp.tp1OrderId',
      'status',
    ],
  },
};

/**
 * Test Case 2: SHORT - Limit order with SL/TP
 */
export const testCase2: TestCase = {
  id: 2,
  name: 'SHORT - Limit Order',
  description: 'Open a SHORT position with limit execution, SL and TP',
  command: CommandEnum.SHORT,
  seedOrders: [
    {
      _id: new ObjectId(),
      orderId: 'test-short-001',
      accountId: BASE_ACCOUNT_ID,
      messageId: BASE_MESSAGE_ID + 2,
      channelId: BASE_CHANNEL_ID,
      status: OrderStatus.PENDING,
      side: OrderSide.SHORT,
      executionType: OrderExecutionType.limit,
      tradeType: TradeType.GOLD_CFD,
      symbol: BASE_SYMBOL,
      lotSize: 100,
      entry: {
        entryPrice: 2650,
      },
      createdAt: new Date(),
      history: [
        {
          _id: new ObjectId(),
          status: OrderHistoryStatus.INTEND,
          service: 'trade-manager',
          ts: new Date(),
          traceToken: 'trace-short-001',
          messageId: BASE_MESSAGE_ID + 2,
          channelId: BASE_CHANNEL_ID,
          command: CommandEnum.SHORT,
        },
      ],
    },
  ],
  payload: {
    orderId: 'test-short-001',
    messageId: BASE_MESSAGE_ID + 2,
    channelId: BASE_CHANNEL_ID,
    accountId: BASE_ACCOUNT_ID,
    traceToken: 'trace-short-001',
    symbol: BASE_SYMBOL,
    command: CommandEnum.SHORT,
    lotSize: 1,
    isImmediate: false,
    entry: 5000,
    stopLoss: {
      price: 5100,
    },
    takeProfits: [
      {
        price: 4500,
      },
    ],
    timestamp: Date.now(),
  },
  expectedDbState: {
    status: OrderStatus.OPEN,
    historyCount: 2,
    historyLastStatus: OrderHistoryStatus.OPEN,
    checkFields: ['entry.entryOrderId', 'entry.actualEntryPrice', 'status'],
  },
};

/**
 * Test Case 3: MOVE_SL - Move stop loss to entry
 * Prerequisite: Test Case 1 (LONG order must exist)
 */
export const testCase3: TestCase = {
  id: 3,
  name: 'MOVE_SL',
  description: 'Move stop loss to entry price for an open position',
  command: CommandEnum.MOVE_SL,
  prerequisiteTestCaseId: 1, // Requires test case 1 to run first
  seedOrders: [], // No seed orders - uses order from test case 1
  payload: {
    orderId: 'test-long-001', // Reuse order from test case 1
    messageId: BASE_MESSAGE_ID + 3,
    channelId: BASE_CHANNEL_ID,
    accountId: BASE_ACCOUNT_ID,
    traceToken: 'trace-movesl-001',
    symbol: BASE_SYMBOL,
    command: CommandEnum.MOVE_SL,
    stopLoss: {
      price: 4200, // Move SL to a new price
    },
    timestamp: Date.now(),
  },
  expectedDbState: {
    status: OrderStatus.OPEN,
    historyCount: 3, // INTEND + OPEN + MOVE_SL
    historyLastStatus: OrderHistoryStatus.UPDATE,
    checkFields: ['sl.slPrice', 'sl.slOrderId'],
  },
};

/**
 * Test Case 4: SET_TP_SL - Update both TP and SL
 * Prerequisite: Test Case 1 (LONG order must exist)
 */
export const testCase4: TestCase = {
  id: 4,
  name: 'SET_TP_SL',
  description: 'Update both take profit and stop loss for an open position',
  command: CommandEnum.SET_TP_SL,
  prerequisiteTestCaseId: 1, // Requires test case 1 to run first
  seedOrders: [], // No seed orders - uses order from test case 1
  payload: {
    orderId: 'test-long-001', // Reuse order from test case 1
    messageId: BASE_MESSAGE_ID + 4,
    channelId: BASE_CHANNEL_ID,
    accountId: BASE_ACCOUNT_ID,
    traceToken: 'trace-settpsl-001',
    symbol: BASE_SYMBOL,
    command: CommandEnum.SET_TP_SL,
    stopLoss: {
      price: 2700, // New SL price
    },
    takeProfits: [
      {
        price: 5200, // New TP price
      },
    ],
    timestamp: Date.now(),
  },
  expectedDbState: {
    status: OrderStatus.OPEN,
    historyCount: 3, // INTEND + OPEN + SET_TP_SL (single entry with both updates)
    historyLastStatus: OrderHistoryStatus.UPDATE,
    checkFields: ['sl.slPrice', 'sl.slOrderId', 'tp.tp1Price', 'tp.tp1OrderId'],
  },
};

/**
 * Test Case 5: CLOSE_ALL - Close all open positions
 * Prerequisite: Test Case 1 (LONG order must exist)
 */
export const testCase5: TestCase = {
  id: 5,
  name: 'CLOSE_ALL',
  description: 'Close all open positions for the symbol',
  command: CommandEnum.CLOSE_ALL,
  prerequisiteTestCaseId: 1, // Requires test case 1 to run first
  seedOrders: [], // No seed orders - uses order from test case 1
  payload: {
    orderId: 'test-long-001', // Reuse order from test case 1
    messageId: BASE_MESSAGE_ID + 5,
    channelId: BASE_CHANNEL_ID,
    accountId: BASE_ACCOUNT_ID,
    traceToken: 'trace-closeall-001',
    symbol: BASE_SYMBOL,
    command: CommandEnum.CLOSE_ALL,
    timestamp: Date.now(),
  },
  expectedDbState: {
    status: OrderStatus.CLOSED,
    historyCount: 3, // INTEND + OPEN + CLOSED
    historyLastStatus: OrderHistoryStatus.CLOSED,
    checkFields: ['exit.actualExitPrice', 'pnl.pnl', 'status'],
  },
};

/**
 * Test Case 6: CLOSE_BAD_POSITION - Close specific position
 * Prerequisite: Test Case 1 (LONG order must exist)
 */
export const testCase6: TestCase = {
  id: 6,
  name: 'CLOSE_BAD_POSITION',
  description: 'Close a specific bad position',
  command: CommandEnum.CLOSE_BAD_POSITION,
  prerequisiteTestCaseId: 1, // Requires test case 1 to run first
  seedOrders: [], // No seed orders - uses order from test case 1
  payload: {
    orderId: 'test-long-001', // Reuse order from test case 1
    messageId: BASE_MESSAGE_ID + 6,
    channelId: BASE_CHANNEL_ID,
    accountId: BASE_ACCOUNT_ID,
    traceToken: 'trace-closebad-001',
    symbol: BASE_SYMBOL,
    command: CommandEnum.CLOSE_BAD_POSITION,
    timestamp: Date.now(),
  },
  expectedDbState: {
    status: OrderStatus.CLOSED,
    historyCount: 3, // INTEND + OPEN + CLOSED
    historyLastStatus: OrderHistoryStatus.CLOSED,
    checkFields: ['exit.actualExitPrice', 'pnl.pnl', 'status'],
  },
};

/**
 * Test Case 7: CANCEL - Cancel pending order
 * Prerequisite: Test Case 2 (SHORT limit order must exist)
 */
export const testCase7: TestCase = {
  id: 7,
  name: 'CANCEL',
  description: 'Cancel a pending limit order',
  command: CommandEnum.CANCEL,
  prerequisiteTestCaseId: 2, // Requires test case 2 to run first
  seedOrders: [], // No seed orders - uses order from test case 2
  payload: {
    orderId: 'test-short-001', // Reuse order from test case 2
    messageId: BASE_MESSAGE_ID + 7,
    channelId: BASE_CHANNEL_ID,
    accountId: BASE_ACCOUNT_ID,
    traceToken: 'trace-cancel-001',
    symbol: BASE_SYMBOL,
    command: CommandEnum.CANCEL,
    timestamp: Date.now(),
  },
  expectedDbState: {
    status: OrderStatus.CANCELED,
    historyCount: 3, // INTEND + OPEN + CANCELED
    historyLastStatus: OrderHistoryStatus.CANCELED,
    checkFields: ['status', 'closedAt'],
  },
};

/**
 * All test cases
 */
export const allTestCases: TestCase[] = [
  testCase1,
  testCase2,
  testCase3,
  testCase4,
  testCase5,
  testCase6,
  testCase7,
];
