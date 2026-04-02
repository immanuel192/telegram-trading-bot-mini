/**
 * Purpose: Manage authentication tokens for broker adapters
 * Handles token refresh with race condition protection
 *
 * IMPORTANT: This is an in-memory implementation for single-instance deployment.
 * When scaling to multiple executor-service instances, replace the in-memory
 * Map with Redis-based distributed locking using SETNX pattern.
 *
 * Core Flow:
 * 1. Adapters register their tokens during initialization
 * 2. Store token metadata in memory
 * 3. Refresh tokens when needed with mutex-like protection
 * 4. Update Account.brokerConfig in DB after successful refresh
 */

import { AccountRepository } from '@dal';
import {
  LoggerInstance,
  IErrorCapture,
} from '@telegram-trading-bot-mini/shared/utils';

/**
 * Token metadata stored in memory
 */
interface TokenMetadata {
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  isRefreshing: boolean;
  refreshPromise?: Promise<TokenMetadata>;
  accountId: string; // For DB updates
}

/**
 * Result of token refresh operation
 * Note: expiresIn is optional - we parse expiry from JWT token itself
 */
export interface RefreshTokenResult {
  accessToken: string;
  refreshToken?: string;
  expiresIn?: number; // seconds (optional, we parse from JWT instead)
}

/**
 * Function signature for adapter-specific token refresh logic
 */
export type RefreshTokenFn = () => Promise<RefreshTokenResult>;

export class TokenManager {
  // TODO: When scaling to multiple instances, replace this Map with Redis
  // Use Redis SETNX for distributed locking pattern
  private tokens = new Map<string, TokenMetadata>();

  constructor(
    private accountRepository: AccountRepository,
    private logger: LoggerInstance,
    private errorCapture: IErrorCapture,
  ) {}

  /**
   * Register a token for an adapter
   * Called by adapters during initialization
   *
   * @param tokenKey - Unique key from adapter.getTokenKey()
   * @param accountId - Account ID for DB updates
   * @param token - JWT token or API key
   * @param refreshToken - Refresh token (optional, for JWT-based auth)
   */
  registerToken(
    tokenKey: string,
    accountId: string,
    token: string,
    refreshToken?: string,
  ): void {
    // Check if already registered
    if (this.tokens.has(tokenKey)) {
      this.logger.debug(
        { tokenKey, accountId },
        'Token already registered, skipping',
      );
      return;
    }

    // Parse token expiry
    const expiresAt = this.parseTokenExpiry(token);

    this.tokens.set(tokenKey, {
      accessToken: token,
      refreshToken,
      expiresAt,
      isRefreshing: false,
      accountId,
    });

    this.logger.debug(
      {
        tokenKey,
        accountId,
        expiresAt: new Date(expiresAt),
        hasRefreshToken: !!refreshToken,
      },
      'Token registered',
    );
  }

  /**
   * Get valid access token, refreshing if needed
   * Multiple concurrent calls with same tokenKey will share the refresh operation
   *
   * @param tokenKey - Unique identifier for this token set
   * @param refreshFn - Adapter-specific refresh logic (only for JWT tokens)
   * @returns Valid access token
   */
  async getValidToken(
    tokenKey: string,
    refreshFn?: RefreshTokenFn,
  ): Promise<string> {
    const cached = this.tokens.get(tokenKey);

    if (!cached) {
      throw new Error(
        `Token not found for key: ${tokenKey}. Did you call registerToken()?`,
      );
    }

    // If token is still valid (with 60s buffer), return it
    const bufferMs = 60 * 1000; // 60 seconds
    if (cached.expiresAt > Date.now() + bufferMs) {
      return cached.accessToken;
    }

    // API keys don't expire - if no refreshFn provided, return as-is
    if (!refreshFn) {
      this.logger.debug(
        { tokenKey },
        'Token expired but no refresh function provided (API key?)',
      );
      return cached.accessToken;
    }

    // If already refreshing, wait for that promise
    if (cached.isRefreshing && cached.refreshPromise) {
      this.logger.debug({ tokenKey }, 'Token refresh in progress, waiting...');
      const newMetadata = await cached.refreshPromise;
      return newMetadata.accessToken;
    }

    // Start refresh
    this.logger.info(
      { tokenKey, accountId: cached.accountId },
      'Starting token refresh',
    );
    const refreshPromise = this.performRefresh(
      tokenKey,
      cached.accountId,
      refreshFn,
    );

    // Mark as refreshing
    this.tokens.set(tokenKey, {
      ...cached,
      isRefreshing: true,
      refreshPromise,
    });

    const newMetadata = await refreshPromise;
    return newMetadata.accessToken;
  }

  /**
   * Perform token refresh with retry logic
   */
  private async performRefresh(
    tokenKey: string,
    accountId: string,
    refreshFn: RefreshTokenFn,
  ): Promise<TokenMetadata> {
    let lastError: Error | null = null;

    // Retry once on failure
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        this.logger.debug(
          { tokenKey, accountId, attempt },
          'Attempting token refresh',
        );

        const result = await refreshFn();

        // Parse expiry from the JWT token itself (standard approach)
        // This is more reliable than trusting the expiresIn field from API
        const expiresAt = this.parseTokenExpiry(result.accessToken);

        const newMetadata: TokenMetadata = {
          accessToken: result.accessToken,
          refreshToken: result.refreshToken,
          expiresAt,
          isRefreshing: false,
          accountId,
        };

        // Update in-memory cache
        this.tokens.set(tokenKey, newMetadata);

        // Persist to database
        await this.persistToken(accountId, newMetadata);

        this.logger.info(
          {
            tokenKey,
            accountId,
            expiresAt: new Date(newMetadata.expiresAt),
          },
          'Token refreshed successfully',
        );

        return newMetadata;
      } catch (error) {
        lastError = error as Error;
        this.logger.warn(
          { tokenKey, accountId, attempt, error },
          `Token refresh attempt ${attempt} failed`,
        );

        if (attempt < 2) {
          // Wait before retry
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    }

    // Both attempts failed
    const current = this.tokens.get(tokenKey);
    if (current) {
      this.tokens.set(tokenKey, {
        ...current,
        isRefreshing: false,
        refreshPromise: undefined,
      });
    }

    this.logger.error(
      { tokenKey, accountId, error: lastError },
      'Token refresh failed after retries',
    );

    this.errorCapture.captureException(lastError!, {
      tokenKey,
      accountId,
      context: 'token_refresh_failed',
    });

    throw lastError!;
  }

  /**
   * Persist refreshed token to database
   */
  private async persistToken(
    accountId: string,
    metadata: TokenMetadata,
  ): Promise<void> {
    try {
      await this.accountRepository.updateMany({ accountId }, {
        $set: {
          'brokerConfig.jwtToken': metadata.accessToken,
          'brokerConfig.refreshToken': metadata.refreshToken,
        },
      } as any);

      this.logger.debug({ accountId }, 'Token persisted to database');
    } catch (error) {
      this.logger.error(
        { accountId, error },
        'Failed to persist token to database',
      );
      // Don't throw - token is already refreshed in memory
      this.errorCapture.captureException(error as Error, {
        accountId,
        context: 'token_persist_failed',
      });
    }
  }

  /**
   * Parse JWT token to extract expiry time
   * Returns timestamp in milliseconds
   */
  private parseTokenExpiry(token: string): number {
    try {
      // JWT format: header.payload.signature
      const parts = token.split('.');
      if (parts.length !== 3) {
        // Not a JWT, assume it doesn't expire (API key)
        return Date.now() + 365 * 24 * 60 * 60 * 1000; // 1 year
      }

      const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString());

      if (payload.exp) {
        return payload.exp * 1000; // Convert to milliseconds
      }

      // No expiry in token, assume long-lived
      return Date.now() + 365 * 24 * 60 * 60 * 1000; // 1 year
    } catch (error) {
      this.logger.warn(
        { error },
        'Failed to parse token expiry, assuming long-lived',
      );
      return Date.now() + 365 * 24 * 60 * 60 * 1000; // 1 year
    }
  }

  /**
   * Get token metadata for debugging/monitoring
   */
  getTokenInfo(tokenKey: string): TokenMetadata | undefined {
    return this.tokens.get(tokenKey);
  }

  /**
   * Clear all tokens (for testing)
   */
  clear(): void {
    this.tokens.clear();
  }
}
