/**
 * Jest global setup file
 * Mocks Sentry by default for all tests
 */

// Mock createLogger from shared utils to return fakeLogger
jest.mock('@telegram-trading-bot-mini/shared/utils', () => {
  const original = jest.requireActual(
    '@telegram-trading-bot-mini/shared/utils',
  );
  // We require the test-utils here because jest.mock is hoisted and cannot access
  // variables from the outer scope unless they start with 'mock'
  const {
    fakeLogger,
  } = require('@telegram-trading-bot-mini/shared/test-utils');

  return {
    __esModule: true,
    ...original,
    createLogger: jest.fn(() => fakeLogger),
  };
});

// Use shared Sentry mock pattern - define inline to avoid hoisting issues
jest.mock('@sentry/node', () => {
  // Mock span for tracing
  const mockSpan = {
    setData: jest.fn().mockReturnThis(),
    setStatus: jest.fn().mockReturnThis(),
    setAttribute: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  };

  return {
    // Existing APIs
    init: jest.fn(),
    captureException: jest.fn(),
    captureMessage: jest.fn(),
    setUser: jest.fn(),
    setTag: jest.fn(),
    setContext: jest.fn(),
    addBreadcrumb: jest.fn(),

    // Integrations
    Integrations: {
      Http: jest.fn(() => ({ name: 'Http' })),
      Console: jest.fn(() => ({ name: 'Console' })),
    },
    consoleIntegration: jest.fn(() => ({ name: 'Console' })),

    // NEW: Distributed Tracing APIs
    startSpan: jest
      .fn()
      .mockImplementation((options: any, callback: (span: any) => any) => {
        return callback(mockSpan);
      }),
    continueTrace: jest
      .fn()
      .mockImplementation((context: any, callback: () => any) => {
        return callback();
      }),
    getTraceData: jest.fn(() => ({
      sentryTrace: 'mock-trace-header',
      baggage: 'mock-baggage',
    })),
  };
});

// Mock mtcute globally to prevent actual connection attempts in all tests
jest.mock('@mtcute/node', () => {
  return {
    TelegramClient: jest.fn().mockImplementation(() => ({
      importSession: jest.fn().mockResolvedValue(undefined),
      start: jest.fn().mockResolvedValue({
        id: 12345,
        username: 'test_user',
        displayName: 'Test User',
      }),
      getMe: jest.fn().mockResolvedValue({
        id: 12345,
        username: 'test_user',
        displayName: 'Test User',
      }),
      destroy: jest.fn().mockResolvedValue(undefined),
      resolvePeer: jest.fn(),
      onNewMessage: { add: jest.fn() },
      onEditMessage: { add: jest.fn() },
      onDeleteMessage: { add: jest.fn() },
    })),
    tl: {},
  };
});
