/**
 * Jest global setup file for interpret-service
 * Mocks Sentry and logger by default for all tests
 */

// Mock createLogger from shared utils to return fakeLogger
jest.mock('@telegram-trading-bot-mini/shared/utils', () => {
  const original = jest.requireActual(
    '@telegram-trading-bot-mini/shared/utils',
  );
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

jest.mock('@sentry/profiling-node', () => ({
  nodeProfilingIntegration: jest.fn(() => ({ name: 'Profiling' })),
}));
