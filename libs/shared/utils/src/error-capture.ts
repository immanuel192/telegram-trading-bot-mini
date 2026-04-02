/**
 * Error capture interface for abstracting error reporting
 */
export interface IErrorCapture {
  /**
   * Capture an exception for error reporting
   * @param error - The error to capture
   * @param context - Optional context information
   */
  captureException(error: Error, context?: Record<string, unknown>): void;
}

/**
 * No-op error capture implementation for testing
 */
export class NoOpErrorCapture implements IErrorCapture {
  captureException(_error: Error, _context?: Record<string, unknown>): void {
    // No-op
  }
}
