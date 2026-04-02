/**
 * Purpose: Define Gemini-specific types for session management.
 * Exports: SessionInfo interface.
 * Core Flow: Session metadata for tracking and expiration in Gemini provider.
 */

import { ChatSession } from '@google/generative-ai';

/**
 * Session metadata for tracking and expiration (Gemini-specific)
 */
export interface SessionInfo {
  /** Underlying Gemini chat session */
  session: ChatSession;
  /** When session was created */
  createdAt: Date;
  /** Number of messages processed in this session */
  messageCount: number;
  /** Channel identifier */
  channelId: string;
  /** Account identifier for session isolation */
  accountId: string;
  /** Prompt rule identifier */
  promptId: string;
  /** Prompt content hash for invalidation */
  promptHash: string;
  /** Last time session was used */
  lastUsedAt: Date;
}
