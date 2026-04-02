/**
 * Purpose: Provide test utilities for logger mocking and faking.
 * Exports: mockRootLogger (mock a root logger's child method), fakeLogger (ready-to-use fake logger).
 * Core Flow: Create mock/fake logger instances for testing without real logging output.
 */

import { Logger as LoggerInstance } from 'pino';

/**
 * Mock a root logger to return a jest-mocked logger when child() is called
 * @param rootLogger - The root logger instance to mock
 * @returns Mocked logger instance with jest.fn() methods
 */
export const mockRootLogger = (rootLogger: any) => {
  const mockLogger = {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
    trace: jest.fn(),
    child: jest.fn(),
  };
  jest.spyOn(rootLogger, 'child').mockImplementation(() => mockLogger as any);
  return mockLogger;
};

/**
 * A ready-to-use fake logger instance for tests
 * All methods are jest.fn() so you can assert on calls
 */
export const fakeLogger: LoggerInstance = {
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  trace: jest.fn(),
  child: jest.fn(function (this: any) {
    return this;
  }),
  level: 'info',
  silent: jest.fn(),
} as any;
