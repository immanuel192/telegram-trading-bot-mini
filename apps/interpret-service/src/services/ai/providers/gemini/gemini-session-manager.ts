/**
 * Purpose: Manage chat session lifecycle for Gemini AI with caching and expiration.
 * Exports: GeminiSessionManager class.
 * Core Flow: Cache sessions by (channelId, promptId, promptHash) → handle expiration (8 AM Sydney + 100 msg limit) → reuse sessions.
 *
 * MVP Note: This service directly depends on GoogleGenerativeAI (Gemini-specific).
 * This violates the AI service abstraction principle but is acceptable for MVP.
 * Future: Extract to generic interface when supporting multiple AI providers.
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  PromptCacheService,
  CachedPrompt,
} from '../../../prompt-cache.service';
import { SessionInfo } from './gemini-types';
import { GeminiManagedSession } from './gemini-managed-session';
import { GEMINI_RESPONSE_SCHEMA } from './gemini-response-schema';
import { Logger } from 'pino';

/**
 * Message isolation instruction prepended to all system prompts
 * Ensures messages are processed independently despite shared session
 */
const ISOLATION_INSTRUCTION = `
═══════════════════════════════════════════════════════════════
CRITICAL INSTRUCTION - Message Isolation Protocol
═══════════════════════════════════════════════════════════════

You MUST follow ALL the rules, formats, and guidelines defined in this 
system prompt for EVERY message you process.

However, each user message you receive is INDEPENDENT and ISOLATED. 
Do NOT reference, use, or consider the CONTENT of previous user messages 
or your previous responses in this conversation.

Process each message as if it's the first message in a fresh conversation, 
while ALWAYS applying the same rules and logic defined in this prompt.

In other words:
✓ REMEMBER: All rules, formats, classification logic, and extraction 
             logic defined in this system prompt
✗ FORGET:   The content and context of previous user messages and 
             your previous responses

This is a performance optimization - we reuse the session to avoid 
re-parsing this prompt, but each message must be processed independently.
═══════════════════════════════════════════════════════════════

`;

/**
 * Chat session manager for Gemini AI
 * Manages session lifecycle with caching and expiration strategies:
 * - Daily reset at 8 AM Sydney time
 * - Message count limit (100 messages)
 * - Session isolation per (channelId, promptId, promptHash)
 * - Automatic invalidation when prompt content changes
 */
export class GeminiSessionManager {
  private sessions: Map<string, SessionInfo> = new Map();
  private readonly DAILY_RESET_HOUR = 8; // 8 AM Sydney time
  private readonly MESSAGE_LIMIT = 100;

  constructor(
    private readonly promptCacheService: PromptCacheService,
    private readonly genAI: GoogleGenerativeAI,
    private readonly modelName: string,
    private readonly logger: Logger
  ) {
    this.logger.info(
      {
        modelName,
        resetHour: this.DAILY_RESET_HOUR,
        messageLimit: this.MESSAGE_LIMIT,
      },
      'GeminiSessionManager initialized'
    );
  }

  /**
   * Get or create a managed chat session for the given channel, account, and prompt
   * Handles session expiration and creation automatically
   *
   * @param channelId - Channel identifier
   * @param accountId - Account identifier for session isolation
   * @param promptId - Prompt rule identifier
   * @param forceNew - Force creation of new session (for message limit recreation)
   * @returns GeminiManagedSession ready for message processing
   * @throws Error if prompt not found or session creation fails
   */
  async getOrCreateSession(
    channelId: string,
    accountId: string,
    promptId: string,
    forceNew = false
  ): Promise<GeminiManagedSession> {
    // Fetch prompt with hash from cache (PromptCacheService handles caching)
    const promptData = await this.promptCacheService.getPrompt(promptId);
    if (!promptData) {
      throw new Error(`Prompt not found: ${promptId}`);
    }

    const { hash } = promptData;

    const sessionKey = this.buildSessionKey(
      channelId,
      accountId,
      promptId,
      hash
    );

    // Check if session exists and is still valid (unless forcing new)
    if (!forceNew) {
      const existingSession = this.sessions.get(sessionKey);
      if (existingSession) {
        // Check expiration conditions
        if (this.shouldExpireForDailyReset(existingSession.createdAt)) {
          this.logger.info(
            {
              channelId,
              accountId,
              promptId,
              promptHash: hash,
              createdAt: existingSession.createdAt,
              messageCount: existingSession.messageCount,
            },
            'Session expired due to daily reset (8 AM Sydney)'
          );
          this.clearSession(
            channelId,
            accountId,
            promptId,
            existingSession.promptHash
          );
        } else {
          // Session is valid - return wrapped session
          this.logger.debug(
            {
              channelId,
              accountId,
              promptId,
              promptHash: hash,
              messageCount: existingSession.messageCount,
            },
            'Reusing existing session'
          );
          return new GeminiManagedSession(
            existingSession.session,
            existingSession,
            this,
            this.logger
          );
        }
      }
    }

    // Create new session (or hash changed - old session orphaned)
    return await this.createSession(channelId, accountId, promptId, promptData);
  }

  /**
   * Create a new chat session with system prompt and validate understanding
   *
   * @param channelId - Channel identifier
   * @param accountId - Account identifier for session isolation
   * @param promptId - Prompt rule identifier
   * @param promptData - Cached prompt data with systemPrompt and hash
   * @returns New GeminiManagedSession
   * @throws Error if AI doesn't understand isolation instruction
   */
  private async createSession(
    channelId: string,
    accountId: string,
    promptId: string,
    promptData: CachedPrompt
  ): Promise<GeminiManagedSession> {
    const { systemPrompt, hash } = promptData;

    // Prepend isolation instruction
    const fullSystemPrompt = ISOLATION_INSTRUCTION + systemPrompt;

    // Create Gemini model with system instruction and JSON response mode
    const model = this.genAI.getGenerativeModel({
      model: this.modelName,
      systemInstruction: fullSystemPrompt,
    });

    // Start chat session with JSON response mode and schema
    // The schema enforcement guarantees correct JSON format, no validation needed
    const session = model.startChat({
      history: [],
      generationConfig: {
        responseMimeType: 'application/json',
        responseSchema: GEMINI_RESPONSE_SCHEMA,
        temperature: 0,
        candidateCount: 1,
      },
    });

    // Store session metadata
    const sessionKey = this.buildSessionKey(
      channelId,
      accountId,
      promptId,
      hash
    );
    const sessionInfo: SessionInfo = {
      session,
      createdAt: new Date(),
      messageCount: 0, // Will be incremented by ManagedChatSession
      channelId,
      accountId,
      promptId,
      promptHash: hash,
      lastUsedAt: new Date(),
    };

    this.sessions.set(sessionKey, sessionInfo);

    this.logger.info(
      {
        channelId,
        accountId,
        promptId,
        promptHash: hash,
        sessionKey,
        systemPromptLength: fullSystemPrompt.length,
      },
      'Created new chat session with JSON response mode'
    );

    return new GeminiManagedSession(session, sessionInfo, this, this.logger);
  }

  /**
   * Check if session should expire due to daily reset (8 AM Sydney time)
   * Sydney is UTC+10 (standard) or UTC+11 (daylight saving)
   * We use UTC+10 as baseline since trading gap hours handle edge cases
   *
   * @param sessionCreatedAt - Session creation timestamp
   * @returns True if session should expire
   */
  private shouldExpireForDailyReset(sessionCreatedAt: Date): boolean {
    const now = new Date();

    // Sydney UTC offset: +10 hours (standard time)
    // Note: During daylight saving it's +11, but the 1-hour difference
    // is acceptable given the trading gap hours
    const SYDNEY_UTC_OFFSET_HOURS = 10;
    const SYDNEY_UTC_OFFSET_MS = SYDNEY_UTC_OFFSET_HOURS * 60 * 60 * 1000;

    // Convert UTC timestamps to Sydney time
    const nowSydneyMs = now.getTime() + SYDNEY_UTC_OFFSET_MS;
    const createdSydneyMs = sessionCreatedAt.getTime() + SYDNEY_UTC_OFFSET_MS;

    const nowSydney = new Date(nowSydneyMs);
    const createdSydney = new Date(createdSydneyMs);

    // Get the date parts (YYYY-MM-DD)
    const nowDate = nowSydney.toISOString().split('T')[0];
    const createdDate = createdSydney.toISOString().split('T')[0];

    // If created on a different day, check if we've crossed 8 AM
    if (nowDate !== createdDate) {
      // Session was created on a previous day
      // Check if current time is >= 8 AM (session should expire)
      return nowSydney.getUTCHours() >= this.DAILY_RESET_HOUR;
    }

    // Same day - check if we've crossed 8 AM boundary
    // Session created before 8 AM, now it's after 8 AM
    if (
      createdSydney.getUTCHours() < this.DAILY_RESET_HOUR &&
      nowSydney.getUTCHours() >= this.DAILY_RESET_HOUR
    ) {
      return true;
    }

    return false;
  }

  /**
   * Clear a specific session from cache
   *
   * @param channelId - Channel identifier
   * @param accountId - Account identifier
   * @param promptId - Prompt rule identifier
   * @param promptHash - Prompt content hash
   */
  clearSession(
    channelId: string,
    accountId: string,
    promptId: string,
    promptHash: string
  ): void {
    const sessionKey = this.buildSessionKey(
      channelId,
      accountId,
      promptId,
      promptHash
    );
    const deleted = this.sessions.delete(sessionKey);
    this.logger.debug(
      { channelId, accountId, promptId, promptHash, deleted },
      'Cleared session'
    );
  }

  /**
   * Clear all sessions for a specific channel
   * Useful for channel-level cache invalidation
   *
   * @param channelId - Channel identifier
   */
  clearChannelSessions(channelId: string): void {
    let clearedCount = 0;
    for (const [key, info] of this.sessions.entries()) {
      if (info.channelId === channelId) {
        this.sessions.delete(key);
        clearedCount++;
      }
    }
    this.logger.info(
      { channelId, clearedCount },
      'Cleared all sessions for channel'
    );
  }

  /**
   * Get cache statistics for monitoring
   *
   * @returns Cache statistics
   */
  getCacheStats(): {
    size: number;
    sessions: Array<{
      channelId: string;
      promptId: string;
      promptHash: string;
      createdAt: Date;
      messageCount: number;
      lastUsedAt: Date;
    }>;
  } {
    const sessions = Array.from(this.sessions.values()).map((info) => ({
      channelId: info.channelId,
      promptId: info.promptId,
      promptHash: info.promptHash,
      createdAt: info.createdAt,
      messageCount: info.messageCount,
      lastUsedAt: info.lastUsedAt,
    }));

    return {
      size: this.sessions.size,
      sessions,
    };
  }

  /**
   * Build session key from components
   * Format: channelId:accountId:promptId:promptHash
   *
   * @param channelId - Channel identifier
   * @param accountId - Account identifier
   * @param promptId - Prompt rule identifier
   * @param promptHash - Prompt content hash
   * @returns Session key
   */
  private buildSessionKey(
    channelId: string,
    accountId: string,
    promptId: string,
    promptHash: string
  ): string {
    return `${channelId}:${accountId}:${promptId}:${promptHash}`;
  }
}
