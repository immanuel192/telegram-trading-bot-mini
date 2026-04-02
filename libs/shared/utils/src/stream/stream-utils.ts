/**
 * Purpose: Utility functions for stream consumer configuration.
 * Provides helpers for converting consumer mode configuration to stream start IDs.
 */

import { StreamConsumerMode } from '../constants/consumer';

/**
 * Get the stream start ID based on the consumer mode
 * @param mode - The consumer mode from configuration
 * @returns '0' for BEGINNING mode (replay all messages), '$' for NEW mode (only new messages)
 */
export function getStreamStartId(mode: StreamConsumerMode): string {
  return mode === StreamConsumerMode.BEGINNING ? '0' : '$';
}
