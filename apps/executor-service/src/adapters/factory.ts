/**
 * Purpose: Factory for creating and caching broker adapter instances
 * Exports: BrokerAdapterFactory class
 * Core Flow: Create adapters per account, cache them, support pre-loading on startup
 *
 * The factory manages the lifecycle of broker adapters, ensuring each account
 * has a single adapter instance that's reused across requests.
 */

import { Account, AccountRepository } from '@dal';
import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
import { IBrokerAdapter } from './interfaces';
import { MockAdapter } from './mock/mock.adapter';
// import { OandaAdapter } from './oanda';
import { TokenManager } from '../services/token-manager.service';

export class BrokerAdapterFactory {
  private adapters = new Map<string, IBrokerAdapter>();

  constructor(
    private accountRepository: AccountRepository,
    private tokenManager: TokenManager,
    private logger: LoggerInstance,
  ) {}

  /**
   * Pre-load all adapters for active accounts on startup
   * Ensures no initialization delay on first order
   */
  async preloadAdapters(): Promise<void> {
    this.logger.info('Pre-loading broker adapters for active accounts...');

    const accounts = await this.accountRepository.findAllActive();

    for (const account of accounts) {
      try {
        await this.getOrCreateAdapter(account);
        this.logger.info(
          {
            accountId: account.accountId,
            exchange: account.brokerConfig?.exchangeCode,
          },
          'Adapter pre-loaded successfully',
        );
      } catch (error) {
        this.logger.error(
          { accountId: account.accountId, error },
          'Failed to pre-load adapter, will retry on first order',
        );
        // Don't throw - allow service to start even if some adapters fail
      }
    }

    this.logger.info(
      { totalAdapters: this.adapters.size },
      'Broker adapters pre-loaded',
    );
  }

  /**
   * Get adapter for an account
   * Creates and caches adapter if not already loaded
   *
   * @param accountId - Internal account ID
   * @returns The broker adapter instance
   */
  async getAdapter(accountId: string): Promise<IBrokerAdapter> {
    // Check cache first
    if (this.adapters.has(accountId)) {
      return this.adapters.get(accountId)!;
    }

    // Load from database and create
    const account = await this.accountRepository.findByAccountId(accountId);
    if (!account) {
      throw new Error(`Account not found: ${accountId}`);
    }

    return this.getOrCreateAdapter(account);
  }

  /**
   * Get or create adapter for an account
   * @private
   * @param account - The account instance
   * @returns The broker adapter instance
   */
  private async getOrCreateAdapter(account: Account): Promise<IBrokerAdapter> {
    const accountId = account.accountId;

    // Check cache
    if (this.adapters.has(accountId)) {
      return this.adapters.get(accountId)!;
    }

    // Create adapter
    const adapter = await this.createAdapter(account);

    // Register token with TokenManager
    this.registerAdapterToken(adapter, account);

    // Initialize adapter
    await adapter.init();

    this.adapters.set(accountId, adapter);
    return adapter;
  }

  /**
   * Register adapter's token with TokenManager
   * Supports both JWT-based auth and API key auth
   */
  private registerAdapterToken(
    adapter: IBrokerAdapter,
    account: Account,
  ): void {
    const { brokerConfig } = account;
    if (!brokerConfig) return;

    const tokenKey = adapter.getTokenKey();

    // JWT-based auth (XM, Exness, etc.)
    if (brokerConfig.jwtToken) {
      this.tokenManager.registerToken(
        tokenKey,
        account.accountId,
        brokerConfig.jwtToken,
        brokerConfig.refreshToken,
      );
      this.logger.debug(
        { accountId: account.accountId, tokenKey, authType: 'jwt' },
        'Registered JWT token',
      );
    }
    // API key auth (Binance, OANDA, etc.)
    else if (brokerConfig.apiKey) {
      this.tokenManager.registerToken(
        tokenKey,
        account.accountId,
        brokerConfig.apiKey,
        brokerConfig.apiSecret, // Store as refreshToken for consistency
      );
      this.logger.debug(
        { accountId: account.accountId, tokenKey, authType: 'apikey' },
        'Registered API key',
      );
    }
  }

  /**
   * Create a new adapter instance based on account configuration
   * @private
   */
  private async createAdapter(account: Account): Promise<IBrokerAdapter> {
    const { brokerConfig } = account;

    if (!brokerConfig) {
      throw new Error(`No broker config for account ${account.accountId}`);
    }

    switch (brokerConfig.exchangeCode) {
      case 'mock':
        return new MockAdapter(account.accountId, brokerConfig, this.logger);

      /*
      case 'oanda':
        return new OandaAdapter(
          account.accountId,
          brokerConfig,
          this.tokenManager,
          this.logger,
        );
      */

      // Real adapters added post-MVP:
      // case 'binanceusdm':
      //   return new BinanceFutureAdapter(account, this.logger);
      // case 'xm':
      //   return new XMAdapter(account, this.tokenManager, this.logger);
      // case 'exness':
      //   return new ExnessAdapter(account, this.tokenManager, this.logger);

      default:
        throw new Error(`Unsupported exchange: ${brokerConfig.exchangeCode}`);
    }
  }

  /**
   * Close all adapters and clear cache
   * Called during service shutdown
   */
  async closeAll(): Promise<void> {
    this.logger.info('Closing all broker adapters...');
    await Promise.all(
      Array.from(this.adapters.values()).map((adapter) => adapter.close()),
    );
    this.adapters.clear();
    this.logger.info('All adapters closed');
  }

  /**
   * Get count of cached adapters
   * Useful for monitoring and debugging
   */
  getAdapterCount(): number {
    return this.adapters.size;
  }

  /**
   * Get all cached adapters as an array
   * Used by background jobs to iterate over all active adapters
   *
   * @returns Array of all cached adapter instances
   */
  getAllAdapters(): IBrokerAdapter[] {
    return Array.from(this.adapters.values());
  }
}
