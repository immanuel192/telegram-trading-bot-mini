/**
 * Test data factories for creating test fixtures
 * Purpose: Reduce code duplication in tests by providing reusable factory functions
 */

import {
  CommandEnum,
  CommandSide,
} from '@telegram-trading-bot-mini/shared/utils';
import { OperationHoursConfig } from '@dal';

/**
 * Factory for creating TRANSLATE_MESSAGE_RESULT command payloads
 */
export const createTranslateResultCommand = (
  overrides: {
    command?: CommandEnum;
    isCommand?: boolean;
    confidence?: number;
    reason?: string;
    extraction?: {
      symbol?: string;
      side?: CommandSide;
      isImmediate?: boolean;
      entry?: number;
      entryZone?: number[];
      stopLoss?: { price?: number; pips?: number };
      takeProfits?: Array<{ price?: number; pips?: number }>;
      isLinkedWithPrevious?: boolean;
      validationError?: string;
      meta?: Record<string, any>;
    };
  } = {},
) => {
  const {
    command = CommandEnum.LONG,
    isCommand = true,
    confidence = 0.95,
    reason = 'Test command',
    extraction = {},
  } = overrides;

  const baseExtraction = {
    symbol: 'BTCUSDT',
    side: CommandSide.BUY,
    isImmediate: false,
    meta: {},
    entryZone: [],
    stopLoss: { price: 49000 },
    takeProfits: [{ price: 51000 }],
    validationError: '',
    ...extraction,
  };

  return {
    isCommand,
    confidence,
    reason,
    command,
    ...(isCommand && { extraction: baseExtraction }),
  };
};

/**
 * Factory for creating TRANSLATE_MESSAGE_RESULT payloads
 */
export const createTranslateResultPayload = (
  overrides: {
    messageId?: number;
    channelId?: string;
    promptId?: string;
    traceToken?: string;
    receivedAt?: number;
    commands?: any[];
  } = {},
) => {
  const {
    messageId = 100,
    channelId = '123456789',
    promptId = 'prompt-123',
    traceToken = 'trace-123',
    receivedAt = Date.now() - 200,
    commands = [createTranslateResultCommand()],
  } = overrides;

  return {
    receivedAt,
    messageId,
    channelId,
    promptId,
    traceToken,
    commands,
  };
};

/**
 * Factory for creating test Account records
 */
export const createTestAccount = (
  overrides: {
    accountId?: string;
    telegramChannelCode?: string;
    isActive?: boolean;
    accountType?: string;
    promptId?: string;
    brokerConfig?: {
      exchangeCode?: string;
      apiKey?: string;
      accountId?: string;
      unitsPerLot?: number;
      minLotSize?: number;
      maxLotSize?: number;
      lotStepSize?: number;
      maxShareVirtualAccounts?: number;
      isSandbox?: boolean;
    };
    configs?: {
      linkedOrderOptimiseTp?: boolean;
      disableCloseBadPosition?: boolean;
      closeOppositePosition?: boolean;
      defaultMaxRiskPercentage?: number;
      defaultLotSize?: number;
      addOnStopLossPercentForAdjustEntry?: number;
      takeProfitIndex?: number;
      forceNoTakeProfit?: boolean;
      maxOpenPositions?: number;
      defaultLeverage?: number;
      maxLeverage?: number;
      operationHours?: OperationHoursConfig;
    };
    symbols?: {
      [symbol: string]: {
        operationHours?: OperationHoursConfig;
        pipValue?: number;
      };
    };
  } = {},
) => {
  const {
    accountId = 'test-account-1',
    telegramChannelCode = 'test-channel',
    isActive = true,
    accountType = 'api',
    promptId = 'prompt-123',
    brokerConfig = {},
    configs,
  } = overrides;

  return {
    accountId,
    telegramChannelCode,
    isActive,
    accountType: accountType as any,
    promptId,
    brokerConfig: {
      exchangeCode: 'XM',
      apiKey: 'test-key',
      accountId: 'broker-account-1',
      unitsPerLot: 100000,
      ...brokerConfig,
    },
    ...(configs && { configs }),
    ...(overrides.symbols && { symbols: overrides.symbols }),
    createdAt: new Date(),
  };
};

/**
 * Factory for creating test TelegramChannel records
 */
export const createTestChannel = (
  overrides: {
    channelId?: string;
    channelCode?: string;
    accessHash?: string;
    isActive?: boolean;
  } = {},
) => {
  const {
    channelId = '123456789',
    channelCode = 'test-channel',
    accessHash = 'test-access-hash',
    isActive = true,
  } = overrides;

  return {
    channelId,
    channelCode,
    accessHash,
    isActive,
    createdOn: new Date(),
  };
};

/**
 * Factory for creating test TelegramMessage records
 */
export const createTestMessage = (
  overrides: {
    messageId?: number;
    channelId?: string;
    channelCode?: string;
    message?: string;
    sentAt?: Date;
    receivedAt?: Date;
    hasMedia?: boolean;
    hashTags?: string[];
    history?: any[];
    prevMessage?: { id: number; message: string };
    quotedMessage?: {
      id: number;
      message: string;
      hasMedia: boolean;
      replyToTopId?: number;
    };
  } = {},
) => {
  const {
    messageId = 100,
    channelId = '123456789',
    channelCode = 'test-channel',
    message = 'test message',
    sentAt = new Date(),
    receivedAt = new Date(),
    hasMedia = false,
    hashTags = [],
    history = [],
    prevMessage,
    quotedMessage,
  } = overrides;

  return {
    messageId,
    channelId,
    channelCode,
    message,
    sentAt,
    receivedAt,
    hasMedia,
    hashTags,
    history,
    ...(prevMessage && { prevMessage }),
    ...(quotedMessage && { quotedMessage }),
  };
};

/**
 * Factory for creating test Order records
 */
export const createTestOrder = (
  overrides: {
    orderId?: string;
    accountId?: string;
    messageId?: number;
    channelId?: string;
    symbol?: string;
    side?: string;
    executionType?: string;
    tradeType?: string;
    status?: string;
    lotSize?: number;
    linkedOrders?: string[];
    history?: any[];
  } = {},
) => {
  const {
    orderId = 'test-order-1',
    accountId = 'test-account-1',
    messageId = 100,
    channelId = '123456789',
    symbol = 'BTCUSDT',
    side = 'LONG',
    executionType = 'market',
    tradeType = 'FUTURE',
    status = 'pending',
    lotSize = 0.1,
    linkedOrders,
    history = [],
  } = overrides;

  return {
    orderId,
    accountId,
    messageId,
    channelId,
    symbol,
    side,
    executionType,
    tradeType,
    status,
    lotSize,
    createdAt: new Date(),
    history,
    ...(linkedOrders && { linkedOrders }),
  };
};
