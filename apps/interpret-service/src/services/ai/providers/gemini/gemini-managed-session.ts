/**
 * Purpose: Managed chat session wrapper for automatic message count tracking and session recreation.
 * Exports: GeminiManagedSession class.
 * Core Flow: Wrap ChatSession → track message count → auto-recreate when limit reached.
 */

import { ChatSession } from '@google/generative-ai';
import { SessionInfo } from './gemini-types';
import { Logger } from 'pino';
import type { GeminiSessionManager } from './gemini-session-manager';

/**
 * Managed chat session wrapper that handles message count tracking
 * and automatic session recreation when limits are reached
 */
export class GeminiManagedSession {
  constructor(
    private session: ChatSession,
    private sessionInfo: SessionInfo,
    private readonly chatSessionManager: GeminiSessionManager,
    private readonly logger: Logger
  ) {}

  /**
   * Send a message through the chat session
   * Automatically increments message count and handles session recreation if limit reached
   * @param message - Message to send
   * @returns AI response
   */
  async sendMessage(message: string) {
    const response = await this.session.sendMessage(message);

    // Auto-increment message count after successful send
    await this.incrementMessageCount();

    return response;
  }

  /**
   * Increment message count and recreate session if limit reached
   * Updates internal session reference automatically - caller doesn't need to track new instance
   * Must be called after each successful message send
   */
  async incrementMessageCount(): Promise<void> {
    this.sessionInfo.messageCount++;
    this.sessionInfo.lastUsedAt = new Date();

    // Check if we've hit the message limit
    if (
      this.sessionInfo.messageCount >= this.chatSessionManager['MESSAGE_LIMIT']
    ) {
      this.logger.info(
        {
          channelId: this.sessionInfo.channelId,
          accountId: this.sessionInfo.accountId,
          promptId: this.sessionInfo.promptId,
          messageCount: this.sessionInfo.messageCount,
        },
        'Message limit reached - recreating session internally'
      );

      // Create new session and update our internal references
      const newManagedSession =
        await this.chatSessionManager.getOrCreateSession(
          this.sessionInfo.channelId,
          this.sessionInfo.accountId,
          this.sessionInfo.promptId,
          true // Force new session
        );

      // Update this instance to point to the new session
      this.session = newManagedSession['session'];
      this.sessionInfo = newManagedSession['sessionInfo'];

      this.logger.debug(
        {
          channelId: this.sessionInfo.channelId,
          accountId: this.sessionInfo.accountId,
          promptId: this.sessionInfo.promptId,
        },
        'Internal session reference updated after limit reached'
      );
    }
  }

  /**
   * Get current message count
   */
  getMessageCount(): number {
    return this.sessionInfo.messageCount;
  }

  /**
   * Get session metadata
   */
  getSessionInfo(): Readonly<SessionInfo> {
    return this.sessionInfo;
  }
}
