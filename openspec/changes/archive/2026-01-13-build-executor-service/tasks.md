# Tasks: Build Executor Service

## Overview

Implement `executor-service` to handle trade execution across multiple broker exchanges using event-driven architecture. Tasks grouped by service/library and phase, with clear validation criteria and dependencies.

---

## Phase 1: Core Infrastructure & Foundations (Week 1-2)

### libs/shared/utils: Stream Message Types

#### Task 1.1: Add New Stream Topics ✅
**Objective**: Extend `StreamTopic` enum with executor-service topics

**Changes**:
1. Edit `libs/shared/utils/src/stream/stream-interfaces.ts`
   - Add `ORDER_EXECUTION_RESULTS = 'order-execution-results'` to `StreamTopic` enum
   - Add `PRICE_UPDATES = 'price-updates'` to `StreamTopic` enum
   - Update JSDoc comments for each

**Validation**:
- `nx test shared-utils` passes
- TypeScript compilation successful

**Dependencies**: None

---

#### Task 1.2: Define EXECUTE_ORDER_REQUEST Message Type ✅
**Objective**: Create message contract for order execution requests

**Changes**:
1. Edit `libs/shared/utils/src/interfaces/messages/message-type.ts`
   - Add `EXECUTE_ORDER_REQUEST = 'EXECUTE_ORDER_REQUEST'` to `MessageType` enum

2. Create `libs/shared/utils/src/interfaces/messages/execute-order-request-payload.ts`
   ```typescript
   export enum OrderType {
     LONG = 'LONG',
     SHORT = 'SHORT',
   }
   
   export enum OrderExecutionType {
     market = 'market',
     limit = 'limit',
   }
   
   export interface ExecuteOrderRequestPayload {
     messageId: number;
     channelId: string;
     orderId: string;
     accountId: string;
     traceToken: string;
     symbol: string;
     type: OrderType;
     executionType: OrderExecutionType;
     lotSize: number;
     price: number;
     leverage?: number;
     sl?: number;
     tp?: number;
     timestamp: number;
   }
   ```

3. Edit `libs/shared/utils/src/interfaces/messages/message-type-payload-map.ts`
   - Add `[MessageType.EXECUTE_ORDER_REQUEST]: ExecuteOrderRequestPayload;`

4. Export from `libs/shared/utils/src/interfaces/messages/index.ts`

**Validation**:
- Type inference works: `StreamMessage<MessageType.EXECUTE_ORDER_REQUEST>` resolves correctly
- `nx test shared-utils` passes

**Dependencies**: Task 1.1

---

#### Task 1.3: Define EXECUTE_ORDER_RESULT Message Type ✅
**Objective**: Create message contract for order execution results

**Changes**:
1. Edit `libs/shared/utils/src/interfaces/messages/message-type.ts`
   - Add `EXECUTE_ORDER_RESULT = 'EXECUTE_ORDER_RESULT'` to `MessageType` enum

2. Create `libs/shared/utils/src/interfaces/messages/execute-order-result-payload.ts`
   ```typescript
   export interface ExecuteOrderResultPayload {
     orderId: string;
     accountId: string;
     traceToken: string;
     success: boolean;
     executedAt?: number;
     exchangeOrderId?: string;
     executedPrice?: number;
     executedLots?: number;
     actualSymbol?: string;
     error?: string;
     errorCode?: string;
   }
   ```

3. Edit `libs/shared/utils/src/interfaces/messages/message-type-payload-map.ts`
   - Add `[MessageType.EXECUTE_ORDER_RESULT]: ExecuteOrderResultPayload;`

4. Export from `libs/shared/utils/src/interfaces/messages/index.ts`

**Validation**:
- Type inference works
- `nx test shared-utils` passes

**Dependencies**: Task 1.1

---

#### Task 1.4: Define LIVE_PRICE_UPDATE Message Type ✅
**Objective**: Create message contract for live price updates

**Changes**:
1. Edit `libs/shared/utils/src/interfaces/messages/message-type.ts`
   - Add `LIVE_PRICE_UPDATE = 'LIVE_PRICE_UPDATE'` to `MessageType` enum

2. Create `libs/shared/utils/src/interfaces/messages/live-price-update-payload.ts`
   ```typescript
   export interface LivePriceUpdatePayload {
     accountId: string;
     symbol: string;
     bid: number;
     ask: number;
     timestamp: number;
   }
   ```

3. Edit `libs/shared/utils/src/interfaces/messages/message-type-payload-map.ts`
   - Add `[MessageType.LIVE_PRICE_UPDATE]: LivePriceUpdatePayload;`

4. Export from `libs/shared/utils/src/interfaces/messages/index.ts`

**Validation**:
- Type inference works
- `nx test shared-utils` passes

**Dependencies**: Task 1.1

---

### libs/dal: Account Model Extension

#### Task 1.5: Add Broker Configuration to Account Model ✅
**Objective**: Extend Account model to store broker connection details

**Changes**:
1. Edit `libs/dal/src/models/account.model.ts`
   - Add new interfaces:
   ```typescript
   export interface BrokerConfig {
     exchangeCode: 'binanceusdm' | 'oanda' | 'xm' | 'exness';
     apiKey: string;
     apiSecret?: string;
     isSandbox?: boolean;
     oandaAccountId?: string;
     serverUrl?: string;
     loginId?: string;
   }
   ```
   - Add field to `Account` interface:
   ```typescript
   brokerConfig?: BrokerConfig;
   ```
   - Add JSDoc explaining this is for executor-service broker connections

2. Edit `libs/dal/src/index.ts`
   - Export `BrokerConfig` interface

3. **Add Integration Test**:
   Create `libs/dal/test/integration/account-broker-config.spec.ts`:
   ```typescript
   describe('Account with BrokerConfig', () => {
     it('should save and retrieve account with brokerConfig', async () => {
       const account = await accountRepository.create({
         accountId: 'test-acc-01',
         telegramChannelCode: 'test-channel',
         isActive: true,
         brokerConfig: {
           exchangeCode: 'binanceusdm',
           apiKey: 'test-key',
           apiSecret: 'test-secret',
           isSandbox: true,
         },
       });
       
       const retrieved = await accountRepository.findByAccountId('test-acc-01');
       expect(retrieved.brokerConfig).toBeDefined();
       expect(retrieved.brokerConfig.exchangeCode).toBe('binanceusdm');
     });
   });
   ```

**Validation**:
- `nx test dal` passes
- Integration tests for AccountRepository still pass
- New integration test for brokerConfig passes

**Dependencies**: None

---

### apps/executor-service: Service Scaffolding

#### Task 1.6: Scaffold Executor Service Application ✅
**Objective**: Create executor-service app structure following trade-manager pattern

**Changes**:
1. Run Nx generator:
   ```bash
   nx g @nx/node:application executor-service
   ```

2. Create directory structure:
   ```
   apps/executor-service/
   ├── src/
   │   ├── config.ts
   │   ├── logger.ts
   │   ├── sentry.ts
   │   ├── main.ts
   │   ├── server.ts
   │   ├── container.ts
   │   ├── interfaces/
   │   │   └── index.ts
   │   ├── adapters/
   │   │   └── .gitkeep
   │   ├── events/
   │   │   ├── index.ts
   │   │   └── consumers/
   │   │       └── .gitkeep
   │   ├── services/
   │   │   └── .gitkeep
   │   └── jobs/
   │       └── .gitkeep
   └── test/
       ├── unit/
       ├── integration/
       │   └── setup.ts
       └── utils/
   ```

**Validation**:
- `nx build executor-service` succeeds
- `nx lint executor-service` passes

**Dependencies**: None

---

#### Task 1.7: Implement Executor Service Configuration ✅
**Objective**: Define executor-service config extending BaseConfig

**Changes**:
1. Create `apps/executor-service/src/config.ts`:
   ```typescript
   import { BaseConfig, createConfig } from '@telegram-trading-bot-mini/shared/utils';
   
   export interface ExecutorConfig extends BaseConfig {
     REDIS_URL: string;
     REDIS_TOKEN?: string;
     PRICE_FEED_INTERVAL_MS: number;
     PRICE_FEED_BATCH_SIZE: number;
     ORDER_EXECUTION_TIMEOUT_MS: number;
     ORDER_RETRY_MAX_ATTEMPTS: number;
   }
   
   export const config = createConfig<ExecutorConfig>({
     REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
     REDIS_TOKEN: process.env.REDIS_TOKEN,
     PRICE_FEED_INTERVAL_MS: Number(process.env.PRICE_FEED_INTERVAL_MS) || 5000,
     PRICE_FEED_BATCH_SIZE: Number(process.env.PRICE_FEED_BATCH_SIZE) || 10,
     ORDER_EXECUTION_TIMEOUT_MS: Number(process.env.ORDER_EXECUTION_TIMEOUT_MS) || 30000,
     ORDER_RETRY_MAX_ATTEMPTS: Number(process.env.ORDER_RETRY_MAX_ATTEMPTS) || 3,
   });
   ```

2. Create `.env.sample`:
   ```env
   # Executor Service Configuration
   REDIS_URL=redis://localhost:6379
   REDIS_TOKEN=
   PRICE_FEED_INTERVAL_MS=5000
   PRICE_FEED_BATCH_SIZE=10
   ORDER_EXECUTION_TIMEOUT_MS=30000
   ORDER_RETRY_MAX_ATTEMPTS=3
   
   # Sentry (optional)
   SENTRY_DSN=
   ```

3. **Add Unit Test**:
   Create `apps/executor-service/test/unit/config.spec.ts`:
   ```typescript
   describe('ExecutorConfig', () => {
     it('should load config with defaults', () => {
       expect(config('PRICE_FEED_INTERVAL_MS')).toBe(5000);
       expect(config('ORDER_RETRY_MAX_ATTEMPTS')).toBe(3);
     });
     
     it('should override with environment variables', () => {
       process.env.PRICE_FEED_INTERVAL_MS = '10000';
       // Test env override
     });
   });
   ```

**Validation**:
- Config loads without errors
- All required env vars have defaults
- Unit test passes

**Dependencies**: Task 1.6

---

#### Task 1.8: Implement Logger and Sentry Setup ✅
**Objective**: Create logger and error capture following existing pattern

**Changes**:
1. Create `apps/executor-service/src/logger.ts`:
   ```typescript
   import { createLogger } from '@telegram-trading-bot-mini/shared/utils';
   
   export const logger = createLogger('executor-service');
   ```

2. Create `apps/executor-service/src/sentry.ts`:
   ```typescript
   import * as SentryLib from '@sentry/node';
   import { IErrorCapture } from '@telegram-trading-bot-mini/shared/utils';
   import { config } from './config';
   
   const dsn = process.env.SENTRY_DSN;
   
   if (dsn) {
     SentryLib.init({
       dsn,
       environment: config('NODE_ENV'),
       tracesSampleRate: 1.0,
     });
   }
   
   export const Sentry: IErrorCapture = {
     captureException: (error: Error, context?: any) => {
       if (dsn) {
         SentryLib.captureException(error, { extra: context });
       }
     },
     captureMessage: (message: string, context?: any) => {
       if (dsn) {
         SentryLib.captureMessage(message, { extra: context });
       }
     },
   };
   ```

**Validation**:
- Logger outputs correctly
- Sentry initializes without errors

**Dependencies**: Task 1.7

---

#### Task 1.9: Define Container Interface ✅
**Objective**: Define IoC container type for executor-service

**Changes**:
1. Create `apps/executor-service/src/interfaces/index.ts`:
   ```typescript
   import {
     LoggerInstance,
     IStreamPublisher,
     IErrorCapture,
   } from '@telegram-trading-bot-mini/shared/utils';
   import { AccountRepository } from '@dal';
   
   export interface Container {
     logger: LoggerInstance;
     streamPublisher: IStreamPublisher;
     errorCapture: IErrorCapture;
     accountRepository: AccountRepository;
     // Services will be added in later tasks
   }
   ```

**Validation**:
- Type compiles without errors

**Dependencies**: Task 1.6

---

## Phase 2: Broker Abstraction Layer (Week 2-4)

### apps/executor-service/src/adapters: Base Abstractions

#### Task 2.1: Define Broker Adapter Interface ✅
**Objective**: Create base interface all broker adapters must implement

**Changes**:
1. Create `apps/executor-service/src/adapters/interfaces.ts`:
   ```typescript
   /**
    * Parameters for opening a new order (LONG/SHORT commands)
    * Maps from ExecuteOrderRequestPayload for LONG/SHORT commands
    */
   export interface OpenOrderParams {
     symbol: string;
     side: 'BUY' | 'SELL';  // Derived from command: LONG → BUY, SHORT → SELL
     lotSize: number;
     isImmediate: boolean;  // true = market order, false = limit order
     entry?: number;        // Required for limit orders (isImmediate=false)
     stopLoss?: {
       price?: number;
       pips?: number;
     };
     takeProfits?: Array<{
       price?: number;
       pips?: number;
     }>;
     leverage?: number;
     meta?: {
       reduceLotSize?: boolean;
       adjustEntry?: boolean;
     };
     traceToken: string;
   }
   
   /**
    * Parameters for closing an existing order (CLOSE_ALL/CLOSE_BAD_POSITION commands)
    */
   export interface CloseOrderParams {
     orderId: string;       // Internal order ID from Order model
     symbol: string;
     traceToken: string;
   }
   
   /**
    * Parameters for canceling a pending order (CANCEL command)
    * Only applies to PENDING orders, not OPEN positions
    */
   export interface CancelOrderParams {
     orderId: string;       // Internal order ID from Order model
     symbol: string;
     traceToken: string;
   }
   
   /**
    * Parameters for updating stop loss (MOVE_SL/SET_TP_SL commands)
    */
   export interface UpdateStopLossParams {
     orderId: string;
     symbol: string;
     price: number;
     traceToken: string;
   }
   
   /**
    * Parameters for updating take profit (SET_TP_SL command)
    */
   export interface UpdateTakeProfitParams {
     orderId: string;
     symbol: string;
     price: number;
     traceToken: string;
   }
   
   /**
    * Result returned after opening an order
    */
   export interface OpenOrderResult {
     exchangeOrderId: string;  // Broker's order ID
     executedPrice: number;    // Actual fill price
     executedLots: number;     // Actual filled lots
     actualSymbol: string;     // Symbol format used by broker
     executedAt: number;       // Timestamp of execution
   }
   
   /**
    * Result returned after closing an order
    */
   export interface CloseOrderResult {
     exchangeOrderId: string;  // Broker's order ID for the close operation
     closedPrice: number;      // Price at which position was closed
     closedLots: number;       // Lots that were closed
     closedAt: number;         // Timestamp of closure
   }
   
   export interface PriceTicker {
     symbol: string;
     bid: number;
     ask: number;
     timestamp: number;
   }
   
   export interface AccountInfo {
     balance: number;
     equity: number;
     margin: number;
     freeMargin: number;
   }
   
   /**
    * Base interface all broker adapters must implement
    * 
    * Command mapping:
    * - LONG/SHORT → openOrder()
    * - CLOSE_ALL/CLOSE_BAD_POSITION → closeOrder()
    * - CANCEL → cancelOrder() (for PENDING orders only)
    * - MOVE_SL/SET_TP_SL → updateStopLoss()/updateTakeProfit()
    */
   export interface IBrokerAdapter {
     // Lifecycle
     init(): Promise<void>;
     close(): Promise<void>;
     ready(): boolean;
     
     // Order execution
     /**
      * Open a new position (market or limit order)
      * Used for LONG and SHORT commands
      */
     openOrder(params: OpenOrderParams): Promise<OpenOrderResult>;
     
     /**
      * Close an existing OPEN position
      * Used for CLOSE_ALL and CLOSE_BAD_POSITION commands
      */
     closeOrder(params: CloseOrderParams): Promise<CloseOrderResult>;
     
     /**
      * Cancel a PENDING order (not yet filled)
      * Used for CANCEL command
      */
     cancelOrder(params: CancelOrderParams): Promise<void>;
     
     /**
      * Update stop loss for an existing order
      * Used for MOVE_SL and SET_TP_SL commands
      */
     updateStopLoss(params: UpdateStopLossParams): Promise<void>;
     
     /**
      * Update take profit for an existing order
      * Used for SET_TP_SL command
      */
     updateTakeProfit(params: UpdateTakeProfitParams): Promise<void>;
     
     // Market data
     fetchPrice(symbol: string): Promise<PriceTicker>;
     
     // Account info
     getAccountInfo(): Promise<AccountInfo>;
     
     // Metadata
     getName(): string;
     getExchangeCode(): string;
   }
   ```

**Validation**:
- Interface compiles
- All methods have clear signatures
- Parameter interfaces align with ExecuteOrderRequestPayload structure

**Dependencies**: Task 1.6

---

#### Task 2.2: Implement Base Broker Adapter ✅
**Objective**: Create abstract base class with common functionality

**Changes**:
1. Create `apps/executor-service/src/adapters/base.adapter.ts`:
   ```typescript
   import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
   import { 
     IBrokerAdapter, 
     OpenOrderParams, 
     OpenOrderResult,
     CloseOrderParams,
     CloseOrderResult,
     CancelOrderParams,
     UpdateStopLossParams,
     UpdateTakeProfitParams,
     PriceTicker,
     AccountInfo
   } from './interfaces';
   
   export abstract class BaseBrokerAdapter implements IBrokerAdapter {
     protected isReady = false;
     
     constructor(
       protected accountId: string,
       protected logger: LoggerInstance
     ) {}
     
     abstract init(): Promise<void>;
     abstract close(): Promise<void>;
     
     /**
      * Open a new position (market or limit order)
      * Derived classes must implement exchange-specific logic
      */
     abstract openOrder(params: OpenOrderParams): Promise<OpenOrderResult>;
     
     /**
      * Close an existing OPEN position
      * Derived classes must implement exchange-specific logic
      */
     abstract closeOrder(params: CloseOrderParams): Promise<CloseOrderResult>;
     
     /**
      * Cancel a PENDING order
      * Derived classes must implement exchange-specific logic
      */
     abstract cancelOrder(params: CancelOrderParams): Promise<void>;
     
     /**
      * Update stop loss for an existing order
      * Derived classes must implement exchange-specific logic
      */
     abstract updateStopLoss(params: UpdateStopLossParams): Promise<void>;
     
     /**
      * Update take profit for an existing order
      * Derived classes must implement exchange-specific logic
      */
     abstract updateTakeProfit(params: UpdateTakeProfitParams): Promise<void>;
     
     abstract fetchPrice(symbol: string): Promise<PriceTicker>;
     abstract getAccountInfo(): Promise<AccountInfo>;
     abstract getName(): string;
     abstract getExchangeCode(): string;
     
     ready(): boolean {
       return this.isReady;
     }
     
     /**
      * Retry helper with exponential backoff
      * Useful for handling transient broker API errors
      */
     protected async retryWithBackoff<T>(
       fn: () => Promise<T>,
       maxRetries: number = 3,
       initialDelayMs: number = 1000
     ): Promise<T> {
       for (let attempt = 0; attempt < maxRetries; attempt++) {
         try {
           return await fn();
         } catch (error) {
           if (attempt === maxRetries - 1) throw error;
           const delay = initialDelayMs * Math.pow(2, attempt);
           this.logger.warn({ attempt, delay }, 'Retrying after error');
           await new Promise(resolve => setTimeout(resolve, delay));
         }
       }
       throw new Error('Unreachable');
     }
   }
   ```

**Validation**:
- Compiles without errors
- Unit test for retry logic passes
- All abstract methods match IBrokerAdapter interface

**Integration Test**:
```typescript
// test/unit/adapters/base.adapter.spec.ts
describe('BaseBrokerAdapter retry logic', () => {
  it('should retry failed operations with exponential backoff', async () => {
    // Test implementation
  });
});
```

**Dependencies**: Task 2.1

---

### apps/executor-service/src/adapters/mock: Mock Adapter for Testing

#### Task 2.3: Create Mock Broker Adapter ✅
**Objective**: Create fake adapter for end-to-end testing without real exchange APIs

**Rationale**: Allows complete service testing and wiring before implementing real exchange integrations. Real adapters (Bitget, XM, Exness) added post-MVP based on actual needs.

**Changes**:
1. Create `apps/executor-service/src/adapters/mock/mock.adapter.ts`:
   ```typescript
   import { BaseBrokerAdapter } from '../base.adapter';
   import { 
     OpenOrderParams, 
     OpenOrderResult,
     CloseOrderParams,
     CloseOrderResult,
     CancelOrderParams,
     UpdateStopLossParams,
     UpdateTakeProfitParams,
     PriceTicker, 
     AccountInfo 
   } from '../interfaces';
   import { BrokerConfig } from '@dal';
   import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
   
   export class MockAdapter extends BaseBrokerAdapter {
     private mockOrders = new Map<string, OpenOrderResult>();
     private mockPrices = new Map<string, number>();
     
     constructor(
       accountId: string,
       private brokerConfig: BrokerConfig,
       logger: LoggerInstance
     ) {
       super(accountId, logger);
     }
     
     async init(): Promise<void> {
       this.logger.info({ accountId: this.accountId }, 'Mock adapter initialized');
       this.isReady = true;
       
       // Initialize mock prices for common symbols
       this.mockPrices.set('BTCUSDT', 50000);
       this.mockPrices.set('ETHUSDT', 3000);
       this.mockPrices.set('XAUUSD', 2000);
     }
     
     async close(): Promise<void> {
       this.logger.info({ accountId: this.accountId }, 'Mock adapter closed');
       this.isReady = false;
     }
     
     async openOrder(params: OpenOrderParams): Promise<OpenOrderResult> {
       this.logger.info(
         { 
           symbol: params.symbol,
           side: params.side,
           lotSize: params.lotSize,
           isImmediate: params.isImmediate,
           traceToken: params.traceToken 
         },
         'Mock: Opening order'
       );
       
       // Simulate execution delay
       await new Promise(resolve => setTimeout(resolve, 100));
       
       const basePrice = this.mockPrices.get(params.symbol) || 1000;
       const executedPrice = params.entry || basePrice + (Math.random() - 0.5) * 10;
       
       const result: OpenOrderResult = {
         exchangeOrderId: `MOCK-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
         executedPrice,
         executedLots: params.lotSize,
         actualSymbol: params.symbol,
         executedAt: Date.now(),
       };
       
       this.logger.info(
         { 
           exchangeOrderId: result.exchangeOrderId,
           executedPrice: result.executedPrice,
           traceToken: params.traceToken 
         },
         'Mock: Order opened successfully'
       );
       
       return result;
     }
     
     async closeOrder(params: CloseOrderParams): Promise<CloseOrderResult> {
       this.logger.info(
         { 
           orderId: params.orderId,
           symbol: params.symbol,
           traceToken: params.traceToken 
         },
         'Mock: Closing order'
       );
       
       // Simulate execution delay
       await new Promise(resolve => setTimeout(resolve, 100));
       
       const basePrice = this.mockPrices.get(params.symbol) || 1000;
       const closedPrice = basePrice + (Math.random() - 0.5) * 10;
       
       const result: CloseOrderResult = {
         exchangeOrderId: `MOCK-CLOSE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
         closedPrice,
         closedLots: 0.1, // Mock value
         closedAt: Date.now(),
       };
       
       this.logger.info(
         { 
           orderId: params.orderId,
           exchangeOrderId: result.exchangeOrderId,
           closedPrice: result.closedPrice,
           traceToken: params.traceToken 
         },
         'Mock: Order closed successfully'
       );
       
       return result;
     }
     
     async cancelOrder(params: CancelOrderParams): Promise<void> {
       this.logger.info(
         { 
           orderId: params.orderId,
           symbol: params.symbol,
           traceToken: params.traceToken 
         },
         'Mock: Order cancelled'
       );
     }
     
     async updateStopLoss(params: UpdateStopLossParams): Promise<void> {
       this.logger.info(
         { 
           orderId: params.orderId,
           price: params.price,
           traceToken: params.traceToken 
         },
         'Mock: Stop loss updated'
       );
     }
     
     async updateTakeProfit(params: UpdateTakeProfitParams): Promise<void> {
       this.logger.info(
         { 
           orderId: params.orderId,
           price: params.price,
           traceToken: params.traceToken 
         },
         'Mock: Take profit updated'
       );
     }
     
     async fetchPrice(symbol: string): Promise<PriceTicker> {
       const basePrice = this.mockPrices.get(symbol) || 1000;
       // Simulate price fluctuation
       const price = basePrice + (Math.random() - 0.5) * 20;
       
       return {
         symbol,
         bid: price - 0.5,
         ask: price + 0.5,
         timestamp: Date.now(),
       };
     }
     
     async getAccountInfo(): Promise<AccountInfo> {
       return {
         balance: 10000,
         equity: 10500,
         margin: 500,
         freeMargin: 9500,
       };
     }
     
     getName(): string {
       return 'Mock Exchange';
     }
     
     getExchangeCode(): string {
       return this.brokerConfig.exchangeCode;
     }
   }
   ```

2. Create `apps/executor-service/src/adapters/mock/index.ts`:
   ```typescript
   export * from './mock.adapter';
   ```

**Validation**:
- Unit test verifying mock behavior
- All methods return expected mock data

**Unit Test**:
```typescript
// test/unit/adapters/mock/mock.adapter.spec.ts
describe('MockAdapter', () => {
  it('should open order with mock data', async () => {
    const adapter = new MockAdapter('test-acc', mockConfig, logger);
    await adapter.init();
    
    const result = await adapter.openOrder({
      symbol: 'BTCUSDT',
      side: 'BUY',
      lotSize: 0.1,
      isImmediate: true,
      leverage: 10,
      traceToken: 'trace-123',
    });
    
    expect(result.exchangeOrderId).toMatch(/^MOCK-/);
    expect(result.executedLots).toBe(0.1);
  });
  
  it('should close order with mock data', async () => {
    const adapter = new MockAdapter('test-acc', mockConfig, logger);
    await adapter.init();
    
    const result = await adapter.closeOrder({
      orderId: 'test-order-1',
      symbol: 'BTCUSDT',
      traceToken: 'trace-123',
    });
    
    expect(result.exchangeOrderId).toMatch(/^MOCK-CLOSE-/);
    expect(result.closedPrice).toBeGreaterThan(0);
  });
  
  it('should fetch mock prices', async () => {
    const adapter = new MockAdapter('test-acc', mockConfig, logger);
    await adapter.init();
    
    const ticker = await adapter.fetchPrice('BTCUSDT');
    expect(ticker.bid).toBeGreaterThan(0);
    expect(ticker.ask).toBeGreaterThan(ticker.bid);
  });
});
```

**Dependencies**: Task 2.2

---

### apps/executor-service/src/adapters: Broker Factory with Eager Loading

#### Task 2.4: Implement Broker Adapter Factory with Pre-loading ✅
**Objective**: Create factory to instantiate, cache, and pre-load adapters on startup

**Changes**:
1. Create `apps/executor-service/src/adapters/factory.ts`:
   ```typescript
   import { Account, BrokerConfig, AccountRepository } from '@dal';
   import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
   import { IBrokerAdapter } from './interfaces';
   import { MockAdapter } from './mock/mock.adapter';
   import { TokenManager } from '../services/token-manager.service';
   
   export class BrokerAdapterFactory {
     private adapters = new Map<string, IBrokerAdapter>();
     
     constructor(
       private tokenManager: TokenManager,
       private accountRepository: AccountRepository,
       private logger: LoggerInstance
     ) {}
     
     /**
      * Pre-load all adapters for active accounts on startup
      * Ensures no initialization delay on first order
      */
     async preloadAdapters(): Promise<void> {
       this.logger.info('Pre-loading broker adapters for active accounts...');
       
       const accounts = await this.accountRepository.find({ isActive: true });
       
       for (const account of accounts) {
         try {
           await this.getAdapter(account);
           this.logger.info(
             { 
               accountId: account.accountId, 
               exchange: account.brokerConfig?.exchangeCode 
             },
             'Adapter pre-loaded successfully'
           );
         } catch (error) {
           this.logger.error(
             { accountId: account.accountId, error },
             'Failed to pre-load adapter, will retry on first order'
           );
           // Don't throw - allow service to start even if some adapters fail
         }
       }
       
       this.logger.info({ count: this.adapters.size }, 'Adapter pre-loading complete');
     }
     
     async getAdapter(account: Account): Promise<IBrokerAdapter> {
       const key = account.accountId;
       
       if (this.adapters.has(key)) {
         return this.adapters.get(key)!;
       }
       
       const adapter = await this.createAdapter(account);
       await adapter.init();
       
       this.adapters.set(key, adapter);
       return adapter;
     }
     
     private async createAdapter(account: Account): Promise<IBrokerAdapter> {
       const { brokerConfig } = account;
       
       if (!brokerConfig) {
         throw new Error(`No broker config for account ${account.accountId}`);
       }
       
       this.validateBrokerConfig(account);
       
       switch (brokerConfig.exchangeCode) {
         case 'mock':
           return new MockAdapter(
             account.accountId,
             brokerConfig,
             this.logger
           );
         
         // Real adapters added post-MVP:
         // case 'bitget':
         //   return new BitgetAdapter(...);
         // case 'xm':
         //   return new XMAdapter(account, this.tokenManager, this.logger);
         // case 'exness':
         //   return new ExnessAdapter(account, this.tokenManager, this.logger);
         
         default:
           throw new Error(`Unsupported exchange: ${brokerConfig.exchangeCode}`);
       }
     }
     
     private validateBrokerConfig(account: Account): void {
       const { brokerConfig } = account;
       
       if (!brokerConfig) {
         throw new Error(`Account ${account.accountId} missing brokerConfig`);
       }
       
       // Mock adapter doesn't need validation
       if (brokerConfig.exchangeCode === 'mock') {
         return;
       }
       
       // Add validation for real exchanges when implemented
     }
     
     async closeAll(): Promise<void> {
       this.logger.info('Closing all broker adapters...');
       await Promise.all(
         Array.from(this.adapters.values()).map(adapter => adapter.close())
       );
       this.adapters.clear();
       this.logger.info('All adapters closed');
     }
   }
   ```

2. Create `apps/executor-service/src/adapters/index.ts`:
   ```typescript
   export * from './interfaces';
   export * from './base.adapter';
   export * from './factory';
   export * from './mock';
   ```

**Validation**:
- Unit test for factory logic
- Integration test verifying adapter caching and pre-loading

**Unit Test**:
```typescript
// test/unit/adapters/factory.spec.ts
describe('BrokerAdapterFactory', () => {
  it('should create and cache adapters by accountId', async () => {
    const factory = new BrokerAdapterFactory(tokenManager, accountRepo, logger);
    const account = { accountId: 'acc-1', brokerConfig: { exchangeCode: 'mock' } };
    
    const adapter1 = await factory.getAdapter(account as any);
    const adapter2 = await factory.getAdapter(account as any);
    
    expect(adapter1).toBe(adapter2); // Same instance
  });
  
  it('should throw on unsupported exchange', async () => {
    const factory = new BrokerAdapterFactory(tokenManager, accountRepo, logger);
    const account = { accountId: 'acc-1', brokerConfig: { exchangeCode: 'unknown' } };
    
    await expect(factory.getAdapter(account as any)).rejects.toThrow('Unsupported exchange');
  });
  
  it('should pre-load all active account adapters', async () => {
    const accounts = [
      { accountId: 'acc-1', isActive: true, brokerConfig: { exchangeCode: 'mock' } },
      { accountId: 'acc-2', isActive: true, brokerConfig: { exchangeCode: 'mock' } },
    ];
    accountRepo.find = jest.fn().mockResolvedValue(accounts);
    
    const factory = new BrokerAdapterFactory(tokenManager, accountRepo, logger);
    await factory.preloadAdapters();
    
    // Verify both adapters loaded
    const adapter1 = await factory.getAdapter(accounts[0] as any);
    const adapter2 = await factory.getAdapter(accounts[1] as any);
    
    expect(adapter1.ready()).toBe(true);
    expect(adapter2.ready()).toBe(true);
  });
  
  it('should close all adapters on closeAll', async () => {
    const factory = new BrokerAdapterFactory(tokenManager, accountRepo, logger);
    const account = { accountId: 'acc-1', brokerConfig: { exchangeCode: 'mock' } };
    
    const adapter = await factory.getAdapter(account as any);
    expect(adapter.ready()).toBe(true);
    
    await factory.closeAll();
    expect(adapter.ready()).toBe(false);
  });
});
```

**Dependencies**: Task 2.3

---

## Phase 3: Event Handling & Services (Week 3-4)

### apps/executor-service/src/services: Order Executor Service

#### Task 3.1: Implement Order Executor Service ✅
**Objective**: Business logic for executing orders via broker adapters

**Changes**:
1. Create `apps/executor-service/src/services/order-executor.service.ts`:
   ```typescript
   import { BrokerAdapterFactory } from '../adapters/factory';
   import { IStreamPublisher, MessageType, StreamTopic, LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
   import { ExecuteOrderRequestPayload, ExecuteOrderResultPayload } from '@telegram-trading-bot-mini/shared/utils';
   import { OrderRepository } from '@dal';
   
   export class OrderExecutorService {
     constructor(
       private brokerFactory: BrokerAdapterFactory,
       private streamPublisher: IStreamPublisher,
       private orderRepository: OrderRepository,
       private logger: LoggerInstance
     ) {}
     
     async executeOrder(payload: ExecuteOrderRequestPayload): Promise<void> {
       const { accountId, orderId, traceToken } = payload;
       
       try {
         this.logger.info({ accountId, orderId, traceToken }, 'Executing order');
         
         const adapter = await this.brokerFactory.getAdapter({ accountId } as any);
         const result = await adapter.executeOrder({
           orderId: payload.orderId,
           symbol: payload.symbol,
           type: payload.type,
           executionType: payload.executionType,
           lotSize: payload.lotSize,
           price: payload.price,
           leverage: payload.leverage,
           sl: payload.sl,
           tp: payload.tp,
           traceToken: payload.traceToken,
         });
         
         // ✅ HYBRID APPROACH: Update Order.history directly
         await this.orderRepository.updateOne(
           { orderId },
           {
             $push: {
               history: {
                 event: 'EXECUTED',
                 timestamp: result.executedAt,
                 traceToken,
                 data: {
                   exchangeOrderId: result.exchangeOrderId,
                   executedPrice: result.executedPrice,
                   executedLots: result.executedLots,
                   actualSymbol: result.actualSymbol,
                 },
               },
             },
           }
         );
         
         // ✅ Publish event for observability (monitoring/alerting)
         await this.publishResult({
           orderId,
           accountId,
           traceToken,
           success: true,
           ...result,
         });
         
         this.logger.info({ orderId, accountId, traceToken }, 'Order executed successfully');
       } catch (error) {
         this.logger.error({ orderId, accountId, traceToken, error }, 'Order execution failed');
         
         // ✅ Update Order.history with error
         await this.orderRepository.updateOne(
           { orderId },
           {
             $push: {
               history: {
                 event: 'EXECUTION_FAILED',
                 timestamp: Date.now(),
                 traceToken,
                 data: {
                   error: (error as Error).message,
                   errorCode: this.classifyError(error as Error),
                 },
               },
             },
           }
         );
         
         // ✅ Publish error event for alerting
         await this.publishResult({
           orderId,
           accountId,
           traceToken,
           success: false,
           error: (error as Error).message,
           errorCode: this.classifyError(error as Error),
         });
       }
     }
     
     private async publishResult(payload: ExecuteOrderResultPayload): Promise<void> {
       await this.streamPublisher.publish(
         StreamTopic.ORDER_EXECUTION_RESULTS,
         {
           version: '1.0.0',
           type: MessageType.EXECUTE_ORDER_RESULT,
           payload,
         }
       );
     }
     
     private classifyError(error: Error): string {
       // Simple error classification
       if (error.message.includes('insufficient')) return 'INSUFFICIENT_BALANCE';
       if (error.message.includes('invalid symbol')) return 'INVALID_SYMBOL';
       return 'UNKNOWN_ERROR';
     }
   }
   ```

**Validation**:
- Unit test with mocked adapter, publisher, and orderRepository
- Integration test end-to-end
- Verify Order.history updated immediately after execution

**Unit Test**:
```typescript
// test/unit/services/order-executor.service.spec.ts
describe('OrderExecutorService', () => {
  it('should execute order, update DB, and publish success result', async () => {
    const mockAdapter = { executeOrder: jest.fn().mockResolvedValue({
      exchangeOrderId: 'EX-123',
      executedPrice: 50000,
      executedLots: 0.1,
      actualSymbol: 'BTCUSDT',
      executedAt: Date.now(),
    })};
    
    const mockOrderRepo = { updateOne: jest.fn().mockResolvedValue({}) };
    const mockPublisher = { publish: jest.fn().mockResolvedValue({}) };
    
    const service = new OrderExecutorService(
      mockBrokerFactory,
      mockPublisher,
      mockOrderRepo,
      logger
    );
    
    await service.executeOrder({
      orderId: 'order-123',
      accountId: 'acc-1',
      symbol: 'BTCUSDT',
      type: OrderType.LONG,
      executionType: OrderExecutionType.market,
      lotSize: 0.1,
      price: 50000,
      traceToken: 'trace-abc',
      messageId: 1,
      channelId: 'ch-1',
      timestamp: Date.now(),
    });
    
    // Verify DB updated
    expect(mockOrderRepo.updateOne).toHaveBeenCalledWith(
      { orderId: 'order-123' },
      expect.objectContaining({
        $push: expect.objectContaining({
          history: expect.objectContaining({
            event: 'EXECUTED',
            traceToken: 'trace-abc',
          }),
        }),
      })
    );
    
    // Verify event published
    expect(mockPublisher.publish).toHaveBeenCalled();
  });
  
  it('should update DB with error and publish error result on failure', async () => {
    const mockAdapter = { executeOrder: jest.fn().mockRejectedValue(new Error('Insufficient balance')) };
    const mockOrderRepo = { updateOne: jest.fn().mockResolvedValue({}) };
    
    await service.executeOrder({...});
    
    // Verify error in DB
    expect(mockOrderRepo.updateOne).toHaveBeenCalledWith(
      { orderId: 'order-123' },
      expect.objectContaining({
        $push: expect.objectContaining({
          history: expect.objectContaining({
            event: 'EXECUTION_FAILED',
            data: expect.objectContaining({
              error: 'Insufficient balance',
            }),
          }),
        }),
      })
    );
  });
  
  it('should classify errors correctly', () => {});
});
```

**Dependencies**: Tasks 2.4 (Factory), 1.2, 1.3

---

### apps/executor-service/src/events: Order Execution Handler

#### Task 3.2: Implement Order Execution Handler ✅
**Objective**: Stream consumer handler for EXECUTE_ORDER_REQUEST messages

**Changes**:
1. Create `apps/executor-service/src/events/consumers/order-execution-handler.ts`:
   ```typescript
   import { BaseMessageHandler } from '@telegram-trading-bot-mini/shared/utils/stream/consumers/base-message-handler';
   import { MessageType, StreamMessage, LoggerInstance, IErrorCapture } from '@telegram-trading-bot-mini/shared/utils';
   import { OrderExecutorService } from '../../services/order-executor.service';
   
   export class OrderExecutionHandler extends BaseMessageHandler<MessageType.EXECUTE_ORDER_REQUEST> {
     constructor(
       private accountId: string,
       private orderExecutor: OrderExecutorService,
       logger: LoggerInstance,
       errorCapture: IErrorCapture
     ) {
       super(logger, errorCapture);
     }
     
     async handle(
       message: StreamMessage<MessageType.EXECUTE_ORDER_REQUEST>,
       id: string
     ): Promise<void> {
       const { payload } = message;
       this.logMessageReceived(id, MessageType.EXECUTE_ORDER_REQUEST, payload);
       
       try {
         await this.orderExecutor.executeOrder(payload);
       } catch (error) {
         this.logError(id, MessageType.EXECUTE_ORDER_REQUEST, error as Error, {
           orderId: payload.orderId,
           accountId: payload.accountId,
           traceToken: payload.traceToken,
         });
         throw error;
       }
     }
   }
   ```

**Validation**:
- Unit test with mocked OrderExecutorService
- Integration test with Redis Stream

**Integration Test**:
```typescript
// test/integration/events/order-execution-handler.spec.ts
describe('OrderExecutionHandler integration', () => {
  it('should consume and execute order from stream', async () => {});
});
```

**Dependencies**: Task 3.1

---

### apps/executor-service/src/events: Consumer Setup

#### Task 3.3: Implement Event Consumer Setup ✅
**Objective**: Initialize per-account stream consumers

**Changes**:
1. Create `apps/executor-service/src/events/index.ts`:
   ```typescript
   import { RedisStreamConsumer } from '@telegram-trading-bot-mini/shared/utils';
   import { accountRepository } from '@dal';
   import { Container } from '../interfaces';
   import { OrderExecutionHandler } from './consumers/order-execution-handler.ts';
   import { config } from '../config';
   
   export async function startConsumers(container: Container): Promise<void> {
     const { logger, orderExecutor, errorCapture } = container;
     
     const accounts = await accountRepository.find({ isActive: true });
     
     for (const account of accounts) {
       const streamTopic = `stream:trade:account:${account.accountId}`;
       const handler = new OrderExecutionHandler(
         account.accountId,
         orderExecutor,
         logger,
         errorCapture
       );
       
       const consumer = new RedisStreamConsumer({
         url: config('REDIS_URL'),
         token: config('REDIS_TOKEN'),
         logger,
         errorCapture,
       });
       
       consumer.start(
         streamTopic as any,
         `executor-service-${account.accountId}`,
         `executor-1`,
         handler.handle.bind(handler)
       );
       
       logger.info({ accountId: account.accountId, streamTopic }, 'Started consumer for account');
     }
   }
   ```

**Validation**:
- Integration test verifying consumers start correctly
- Multiple account streams handled

**Integration Test**:
```typescript
// test/integration/events/start-consumers.spec.ts
describe('startConsumers', () => {
  it('should start consumer for each active account', async () => {});
});
```

**Dependencies**: Task 3.2

---

### apps/executor-service: Container & Server

#### Task 3.4: Implement IoC Container ✅
**Objective**: Wire up all service dependencies

**Changes**:
1. Update `apps/executor-service/src/container.ts`:
   ```typescript
   import { accountRepository } from '@dal';
   import { LoggerInstance, RedisStreamPublisher, IErrorCapture, NoOpErrorCapture } from '@telegram-trading-bot-mini/shared/utils';
   import { BrokerAdapterFactory } from './adapters/factory';
   import { OrderExecutorService } from './services/order-executor.service';
   import { Container } from './interfaces';
   import { config } from './config';
   import { Sentry } from './sentry';
   
   export function createContainer(logger: LoggerInstance): Container {
     const streamPublisher = new RedisStreamPublisher({
       url: config('REDIS_URL'),
       token: config('REDIS_TOKEN'),
     });
     
     const sentryDsn = process.env.SENTRY_DSN;
     const errorCapture: IErrorCapture = sentryDsn ? Sentry : new NoOpErrorCapture();
     
     const brokerFactory = new BrokerAdapterFactory(logger);
     
     const orderExecutor = new OrderExecutorService(
       brokerFactory,
       streamPublisher,
       logger
     );
     
     return {
       logger,
       streamPublisher,
       errorCapture,
       accountRepository,
       brokerFactory,
       orderExecutor,
     };
   }
   ```

2. Update `apps/executor-service/src/interfaces/index.ts`:
   - Add `brokerFactory: BrokerAdapterFactory`
   - Add `orderExecutor: OrderExecutorService`

3. **Add Unit Test**:
   Create `apps/executor-service/test/unit/container.spec.ts`:
   ```typescript
   describe('Container', () => {
     it('should create container with all dependencies', () => {
       const container = createContainer(logger);
       
       expect(container.logger).toBeDefined();
       expect(container.streamPublisher).toBeDefined();
       expect(container.errorCapture).toBeDefined();
       expect(container.accountRepository).toBeDefined();
       expect(container.brokerFactory).toBeDefined();
       expect(container.orderExecutor).toBeDefined();
     });
   });
   ```

**Validation**:
- Container creation succeeds
- All dependencies injected correctly
- Unit test passes

**Dependencies**: Tasks 2.7, 3.1

---

#### Task 3.5: Implement Server Startup ✅
**Objective**: Start consumers and handle graceful shutdown

**Changes**:
1. Create `apps/executor-service/src/server.ts`:
   ```typescript
   import { startConsumers } from './events';
   import { Container } from './interfaces';
   
   export async function startServer(container: Container): Promise<void> {
     const { logger, tokenManager, brokerFactory } = container;
     
     logger.info('Starting executor-service...');
     
     // 1. Load tokens from database (critical for token-based auth)
     await tokenManager.loadTokensFromDatabase();
     
     // 2. Pre-load all broker adapters for active accounts
     //    Ensures no initialization delay on first order
     await brokerFactory.preloadAdapters();
     
     // 3. Start per-account stream consumers
     await startConsumers(container);
     
     logger.info('Executor-service started successfully');
     
     // Graceful shutdown
     ['SIGTERM', 'SIGINT'].forEach(signal => {
       process.on(signal, async () => {
         logger.info({ signal }, 'Received shutdown signal');
         await container.brokerFactory.closeAll();
         await container.streamPublisher.close();
         logger.info('Executor-service shutdown complete');
         process.exit(0);
       });
     });
   }
   ```

**Validation**:
- Service starts successfully
- All adapters pre-loaded before consumers start
- Tokens loaded from database
- Graceful shutdown works

**Dependencies**: Task 3.3, 3.4

---

#### Task 3.6: Implement Main Entry Point ✅
**Objective**: Bootstrap executor-service

**Changes**:
1. Create `apps/executor-service/src/main.ts`:
   ```typescript
   import { logger } from './logger';
   import { createContainer } from './container';
   import { startServer } from './server';
   
   async function bootstrap() {
     try {
       const container = createContainer(logger);
       await startServer(container);
     } catch (error) {
       logger.error({ error }, 'Failed to start executor-service');
       process.exit(1);
     }
   }
   
   bootstrap();
   ```

**Validation**:
- `nx build executor-service` succeeds
- `node dist/apps/executor-service/main.js` starts without errors

**Dependencies**: Task 3.5

---

## Phase 4: Trade-Manager Integration (Week 5)

### apps/trade-manager: Publish Order Execution Requests

#### Task 4.1: Update TranslateResultHandler to Publish Orders ✅
**Objective**: Modify trade-manager to publish order execution requests

**Changes**:
1. Edit `apps/trade-manager/src/events/consumers/translate-result-handler.ts`:
   - Import `ExecuteOrderRequestPayload`, `MessageType.EXECUTE_ORDER_REQUEST`
   - Add `streamPublisher` dependency
   - After logging translation result, iterate through `commands`:
     - Create `Order` entity for each command
     - Persist Order to database
     - Publish `EXECUTE_ORDER_REQUEST` to `stream:trade:account:{accountId}`

**Pseudo-code**:
```typescript
for (const command of commands) {
  const order = await orderRepository.create({
    messageId,
    channelId,
    accountId: command.accountId,
    orderId: generateOrderId(),
    type: command.type,
    executionType: command.executionType,
    symbol: command.symbol,
    lotSize: command.lotSize,
    price: command.price,
  });
  
  await streamPublisher.publish(
    `stream:trade:account:${command.accountId}`,
    {
      version: '1.0.0',
      type: MessageType.EXECUTE_ORDER_REQUEST,
      payload: {
        messageId,
        channelId,
        orderId: order.orderId,
        accountId: command.accountId,
        traceToken,
        symbol: command.symbol,
        type: command.type,
        executionType: command.executionType,
        lotSize: command.lotSize,
        price: command.price,
        leverage: command.leverage,
        sl: command.sl,
        tp: command.tp,
        timestamp: Date.now(),
      },
    }
  );
}
```

**Validation**:
- Integration test verifying orders published to correct streams
- Order entity persisted correctly

**Integration Test**:
```typescript
// apps/trade-manager/test/integration/translate-result-handler.spec.ts
describe('TranslateResultHandler order publishing', () => {
  it('should create Order and publish EXECUTE_ORDER_REQUEST', async () => {});
});
```

**Dependencies**: Tasks 1.2, existing Order model (from setup-order-model change)

---

### apps/trade-manager: Consume Execution Results

#### Task 4.2: Implement Execution Result Handler (Observability Only)
**Objective**: Create handler to consume EXECUTE_ORDER_RESULT messages for logging and metrics

**Note**: In the Hybrid approach, executor-service already updated Order.history directly. This handler is for observability (logging, metrics, alerting) only.
**Status**: Skipped - Observability handled via logs and Sentry directly in executor-service.

**Changes**:
1. Create `apps/trade-manager/src/events/consumers/execution-result-handler.ts`:
   ```typescript
   import { BaseMessageHandler } from '@telegram-trading-bot-mini/shared/utils/stream/consumers/base-message-handler';
   import { MessageType, StreamMessage, LoggerInstance, IErrorCapture } from '@telegram-trading-bot-mini/shared/utils';
   import { Sentry } from '../../sentry';
   
   export class ExecutionResultHandler extends BaseMessageHandler<MessageType.EXECUTE_ORDER_RESULT> {
     constructor(
       logger: LoggerInstance,
       errorCapture: IErrorCapture
     ) {
       super(logger, errorCapture);
     }
     
     async handle(
       message: StreamMessage<MessageType.EXECUTE_ORDER_RESULT>,
       id: string
     ): Promise<void> {
       const { payload } = message;
       this.logMessageReceived(id, MessageType.EXECUTE_ORDER_RESULT, payload);
       
       try {
         const { orderId, accountId, traceToken, success } = payload;
         
         if (success) {
           // ✅ Log success
           this.logger.info(
             { 
               orderId, 
               accountId,
               traceToken,
               exchangeOrderId: payload.exchangeOrderId,
               executedPrice: payload.executedPrice,
             },
             'Order executed successfully'
           );
           
           // ✅ Emit success metric to Sentry
           Sentry.metrics?.increment('order.execution.success', {
             tags: { accountId, exchange: payload.actualSymbol },
           });
           
         } else {
           // ✅ Log error
           this.logger.error(
             { 
               orderId, 
               accountId,
               traceToken,
               error: payload.error,
               errorCode: payload.errorCode,
             },
             'Order execution failed'
           );
           
           // ✅ Emit error metric and alert
           Sentry.metrics?.increment('order.execution.failure', {
             tags: { accountId, errorCode: payload.errorCode },
           });
           
           // ✅ Capture exception for critical errors
           if (payload.errorCode !== 'INSUFFICIENT_BALANCE') {
             this.errorCapture.captureMessage(
               `Order execution failed: ${payload.error}`,
               { orderId, accountId, traceToken, errorCode: payload.errorCode }
             );
           }
         }
         
         // ❌ NO DB UPDATE - executor-service already updated Order.history
         
       } catch (error) {
         this.logError(id, MessageType.EXECUTE_ORDER_RESULT, error as Error, {
           orderId: payload.orderId,
           accountId: payload.accountId,
           traceToken: payload.traceToken,
         });
         throw error;
       }
     }
   }
   ```

**Validation**:
- Unit test with mocked logger and Sentry
- Integration test verifying events consumed and logged
- **No DB assertions** (executor-service owns Order.history updates)

**Unit Test**:
```typescript
// apps/trade-manager/test/unit/execution-result-handler.spec.ts
describe('ExecutionResultHandler', () => {
  it('should log and emit metrics on successful execution', async () => {
    const handler = new ExecutionResultHandler(logger, errorCapture);
    
    await handler.handle({
      version: '1.0.0',
      type: MessageType.EXECUTE_ORDER_RESULT,
      payload: {
        orderId: 'order-123',
        accountId: 'acc-1',
        traceToken: 'trace-abc',
        success: true,
        exchangeOrderId: 'EX-123',
        executedPrice: 50000,
        executedLots: 0.1,
        actualSymbol: 'BTCUSDT',
        executedAt: Date.now(),
      },
    }, 'msg-id-1');
    
    // Verify logging
    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({ orderId: 'order-123', traceToken: 'trace-abc' }),
      'Order executed successfully'
    );
    
    // Verify metrics
    expect(Sentry.metrics.increment).toHaveBeenCalledWith(
      'order.execution.success',
      expect.any(Object)
    );
  });
  
  it('should log error and alert on execution failure', async () => {
    const handler = new ExecutionResultHandler(logger, errorCapture);
    
    await handler.handle({
      version: '1.0.0',
      type: MessageType.EXECUTE_ORDER_RESULT,
      payload: {
        orderId: 'order-456',
        accountId: 'acc-1',
        traceToken: 'trace-xyz',
        success: false,
        error: 'Invalid symbol',
        errorCode: 'INVALID_SYMBOL',
      },
    }, 'msg-id-2');
    
    // Verify error logging
    expect(logger.error).toHaveBeenCalledWith(
      expect.objectContaining({ error: 'Invalid symbol' }),
      'Order execution failed'
    );
    
    // Verify alert captured
    expect(errorCapture.captureMessage).toHaveBeenCalled();
  });
});
```

**Dependencies**: Task 1.3

---

#### Task 4.3: Wire Execution Result Consumer into Trade-Manager
**Objective**: Add consumer for ORDER_EXECUTION_RESULTS stream

**Changes**:
1. Edit `apps/trade-manager/src/config.ts`:
   - Add `STREAM_CONSUMER_MODE_EXECUTION_RESULTS: string` (for consumer mode config)

2. Edit `apps/trade-manager/src/events/index.ts`:
   - Import `ExecutionResultHandler`
   - Create consumer for `StreamTopic.ORDER_EXECUTION_RESULTS`:

**Pseudo-code**:
```typescript
const executionResultConsumer = new RedisStreamConsumer({
  url: config('REDIS_URL'),
  token: config('REDIS_TOKEN'),
  logger,
  errorCapture,
});

const executionResultHandler = new ExecutionResultHandler(logger, errorCapture);

executionResultConsumer.start(
  StreamTopic.ORDER_EXECUTION_RESULTS,
  'trade-manager-execution-results',
  'trade-manager-1',
  executionResultHandler.handle.bind(executionResultHandler)
);
```

**Validation**:
- Integration test verifying consumer starts and processes messages

**Integration Test**:
```typescript
// apps/trade-manager/test/integration/execution-result-consumer.spec.ts
describe('Execution result consumer', () => {
  it('should consume and process EXECUTE_ORDER_RESULT', async () => {});
});
```

**Dependencies**: Task 4.2

---

### Phase 5: Price Feed Implementation (Week 6) ✅

### apps/executor-service/src/services: Price Feed Service

#### Task 5.1: Implement Price Feed Service ✅
**Objective**: Fetch live prices from brokers and publish updates

**Changes**:
1. Create `apps/executor-service/src/services/price-feed.service.ts`:
   ```typescript
   import { BrokerAdapterFactory } from '../adapters/factory';
   import { IStreamPublisher, MessageType, StreamTopic, LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
   import { AccountRepository } from '@dal';
   
   export class PriceFeedService {
     constructor(
       private brokerFactory: BrokerAdapterFactory,
       private streamPublisher: IStreamPublisher,
       private accountRepository: AccountRepository,
       private logger: LoggerInstance
     ) {}
     
     async fetchAndPublishPrices(): Promise<void> {
       const accounts = await this.accountRepository.find({ isActive: true });
       
       for (const account of accounts) {
         try {
           const adapter = await this.brokerFactory.getAdapter(account);
           
           // Fetch prices for active symbols
           // (In MVP, fetch from a predefined list or active orders)
           const symbols = this.getActiveSymbols(account);
           
           for (const symbol of symbols) {
             const ticker = await adapter.fetchPrice(symbol);
             
             await this.streamPublisher.publish(
               StreamTopic.PRICE_UPDATES,
               {
                 version: '1.0.0',
                 type: MessageType.LIVE_PRICE_UPDATE,
                 payload: {
                   accountId: account.accountId,
                   symbol: ticker.symbol,
                   bid: ticker.bid,
                   ask: ticker.ask,
                   timestamp: ticker.timestamp,
                 },
               }
             );
           }
         } catch (error) {
           this.logger.error({ accountId: account.accountId, error }, 'Failed to fetch prices');
         }
       }
     }
     
     private getActiveSymbols(account: Account): string[] {
       // For MVP, return hardcoded list or fetch from active orders
       return ['BTCUSDT', 'ETHUSDT']; // Placeholder
     }
   }
   ```

**Validation**:
- Unit test with mocked adapter and publisher
- Integration test verifying price publishing

**Unit Test**:
```typescript
// test/unit/services/price-feed.service.spec.ts
describe('PriceFeedService', () => {
  it('should fetch and publish prices for active accounts', async () => {});
  it('should handle errors gracefully', async () => {});
});
```

**Dependencies**: Tasks 2.7, 1.4

---

### apps/executor-service/src/jobs: Price Feed Job

#### Task 5.2: Implement Price Feed Background Job ✅
**Objective**: Periodically trigger price feed service

**Changes**:
1. Create `apps/executor-service/src/jobs/price-feed.job.ts`:
   ```typescript
   import { PriceFeedService } from '../services/price-feed.service';
   import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
   import { config } from '../config';
   
   export class PriceFeedJob {
     private intervalId?: NodeJS.Timeout;
     
     constructor(
       private priceFeed: PriceFeedService,
       private logger: LoggerInstance
     ) {}
     
     start(): void {
       const interval = config('PRICE_FEED_INTERVAL_MS');
       
       this.intervalId = setInterval(async () => {
         try {
           await this.priceFeed.fetchAndPublishPrices();
         } catch (error) {
           this.logger.error({ error }, 'Price feed job failed');
         }
       }, interval);
       
       this.logger.info({ interval }, 'Price feed job started');
     }
     
     stop(): void {
       if (this.intervalId) {
         clearInterval(this.intervalId);
         this.logger.info('Price feed job stopped');
       }
     }
   }
   ```

2. Create `apps/executor-service/src/jobs/index.ts`:
   ```typescript
   import { Container } from '../interfaces';
   import { PriceFeedJob } from './price-feed.job';
   
   export function startJobs(container: Container): void {
     const { priceFeed, logger } = container;
     
     const priceFeedJob = new PriceFeedJob(priceFeed, logger);
     priceFeedJob.start();
     
     // Graceful shutdown
     ['SIGTERM', 'SIGINT'].forEach(signal => {
       process.on(signal, () => {
         priceFeedJob.stop();
       });
     });
   }
   ```

**Validation**:
- Integration test verifying job runs on interval
- Prices published to stream

**Integration Test**:
```typescript
// test/integration/jobs/price-feed.job.spec.ts
describe('PriceFeedJob', () => {
  it('should publish prices on interval', async () => {
    // Wait for 2 intervals, verify 2+ publishes
  }, 15000);
});
```

**Dependencies**: Task 5.1

---

#### Task 5.3: Wire Price Feed into Server ✅
**Objective**: Start price feed job on server startup

**Changes**:
1. Edit `apps/executor-service/src/server.ts`:
   - Import `startJobs`
   - Call `startJobs(container)` after `startConsumers`

2. Update `apps/executor-service/src/container.ts`:
   - Add `priceFeed: PriceFeedService` to container

3. Update `apps/executor-service/src/interfaces/index.ts`:
   - Add `priceFeed: PriceFeedService` to Container interface

**Validation**:
- Service starts with price feed running
- Prices published to stream

**Dependencies**: Task 5.2

---

### apps/trade-manager: Consume Price Updates

#### Task 5.4: Implement Price Update Handler (Optional for MVP)
**Objective**: Create handler to consume LIVE_PRICE_UPDATE messages

**Note**: This task is optional for initial MVP. Trade-manager can add this later when price context is needed for future logic.

**Changes**:
1. Create `apps/trade-manager/src/events/consumers/price-update-handler.ts`:
   ```typescript
   import { BaseMessageHandler } from '@telegram-trading-bot-mini/shared/utils/stream/consumers/base-message-handler';
   import { MessageType, StreamMessage, LoggerInstance, IErrorCapture } from '@telegram-trading-bot-mini/shared/utils';
   
   export class PriceUpdateHandler extends BaseMessageHandler<MessageType.LIVE_PRICE_UPDATE> {
     constructor(
       logger: LoggerInstance,
       errorCapture: IErrorCapture
     ) {
       super(logger, errorCapture);
     }
     
     async handle(
       message: StreamMessage<MessageType.LIVE_PRICE_UPDATE>,
       id: string
     ): Promise<void> {
       const { payload } = message;
       this.logMessageReceived(id, MessageType.LIVE_PRICE_UPDATE, payload);
       
       // For MVP: Just log. Future: Update price cache for trade logic
       this.logger.debug({ ...payload }, 'Received price update');
     }
   }
   ```

2. Edit `apps/trade-manager/src/events/index.ts`:
   - Create consumer for `StreamTopic.PRICE_UPDATES`
   - Wire up `PriceUpdateHandler`

**Validation**:
- Integration test verifying price updates consumed

**Dependencies**: Task 5.3

---

## Phase 6: Testing & Documentation (Week 6)

### Integration Testing

#### Task 6.1: End-to-End Integration Test
**Objective**: Test full flow from trade-manager to executor-service and back

**Changes**:
1. Create `apps/executor-service/test/integration/e2e-order-flow.spec.ts`:
   ```typescript
   describe('End-to-end order flow', () => {
     it('should execute order from trade-manager publish to executor-service and back', async () => {
       // 1. Publish EXECUTE_ORDER_REQUEST to account stream
       // 2. Wait for executor-service to consume
       // 3. Verify EXECUTE_ORDER_RESULT published
       // 4. Verify Order updated in database
     });
   });
   ```

**Validation**:
- Full flow works end-to-end
- All integration tests pass

**Dependencies**: All previous tasks

---

### Documentation

#### Task 6.2: Create Executor Service README ✅
**Objective**: Document executor-service architecture and usage

**Changes**:
1. Create `apps/executor-service/README.md`:
   - Purpose and responsibilities
   - Architecture overview
   - Broker adapter pattern
   - Configuration guide
   - Development setup
   - Testing guide
   - Deployment instructions

**Validation**:
- Documentation is clear and complete

**Dependencies**: None

---

#### Task 6.3: Update Project README ✅
**Objective**: Document executor-service in main project README

**Changes**:
1. Edit `README.md`:
   - Add executor-service to service list
   - Document environment variables
   - Update development commands

**Validation**:
- Documentation accurate

**Dependencies**: Task 6.2

---

### Deployment Configuration

#### Task 6.4: Create PM2 Configuration ✅
**Objective**: Configure PM2 for executor-service deployment

**Changes**:
1. Create `infra/pm2/executor-service.config.js`:
   ```javascript
   module.exports = {
     apps: [{
       name: 'executor-service',
       script: './dist/apps/executor-service/main.js',
       instances: 1,
       exec_mode: 'fork',
       env: {
         NODE_ENV: 'production',
         DOTENV: '.env.local',
       },
     }],
   };
   ```

2. Update `infra/pm2/ecosystem.config.js`:
   - Include executor-service in main ecosystem

**Validation**:
- PM2 starts executor-service successfully

**Dependencies**: Task 3.6

---

## Phase 7: Real Exchange Adapters (Post-MVP)

**Note**: These tasks are implemented post-MVP based on actual business needs. MVP uses Mock adapter for complete end-to-end testing.

### apps/executor-service/src/adapters/bitget: Bitget Adapter

#### Task 7.1: Implement Bitget Adapter (CCXT-based)
**Objective**: Add Bitget exchange support using ccxt library

**Priority**: High (primary exchange needed)

**Changes**:
1. Install ccxt if not already installed:
   ```bash
   npm install ccxt
   npm install -D @types/ccxt
   ```

2. Create `apps/executor-service/src/adapters/bitget/bitget.adapter.ts`:
   ```typescript
   import { BaseBrokerAdapter } from '../base.adapter';
   import { ExecuteOrderParams, ExecuteOrderResult, PriceTicker, AccountInfo } from '../interfaces';
   import { BrokerConfig } from '@dal';
   import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
   import ccxt from 'ccxt';
   
   export class BitgetAdapter extends BaseBrokerAdapter {
     private exchange: ccxt.bitget;
     
     constructor(
       accountId: string,
       private brokerConfig: BrokerConfig,
       logger: LoggerInstance
     ) {
       super(accountId, logger);
     }
     
     async init(): Promise<void> {
       this.logger.info({ accountId: this.accountId }, 'Initializing Bitget adapter');
       
       this.exchange = new ccxt.bitget({
         apiKey: this.brokerConfig.apiKey,
         secret: this.brokerConfig.apiSecret,
         options: {
           defaultType: 'swap', // USDT-M futures
           adjustForTimeDifference: true,
         },
         enableRateLimit: true,
       });
       
       if (this.brokerConfig.isSandbox) {
         this.exchange.setSandboxMode(true);
       }
       
       // Test connection
       await this.exchange.loadMarkets();
       
       this.isReady = true;
       this.logger.info({ accountId: this.accountId }, 'Bitget adapter initialized');
     }
     
     async close(): Promise<void> {
       this.logger.info({ accountId: this.accountId }, 'Closing Bitget adapter');
       this.isReady = false;
     }
     
     async executeOrder(params: ExecuteOrderParams): Promise<ExecuteOrderResult> {
       this.logger.info(
         { 
           orderId: params.orderId, 
           symbol: params.symbol,
           traceToken: params.traceToken 
         },
         'Bitget: Executing order'
       );
       
       const symbol = this.lookupSymbol(params.symbol);
       const side = params.type === 'LONG' ? 'buy' : 'sell';
       
       // Place market order
       const order = await this.retryWithBackoff(async () => {
         return await this.exchange.createMarketOrder(
           symbol,
           side,
           params.lotSize,
           {
             positionSide: params.type === 'LONG' ? 'long' : 'short',
           }
         );
       });
       
       // Set leverage if specified
       if (params.leverage) {
         await this.exchange.setLeverage(params.leverage, symbol);
       }
       
       // Place SL/TP orders if specified
       if (params.sl || params.tp) {
         await this.placeSLTP(symbol, side, params.lotSize, params.sl, params.tp);
       }
       
       const result: ExecuteOrderResult = {
         exchangeOrderId: order.id,
         executedPrice: order.average || order.price || params.price,
         executedLots: order.filled || params.lotSize,
         actualSymbol: symbol,
         executedAt: order.timestamp || Date.now(),
       };
       
       this.logger.info(
         { 
           orderId: params.orderId,
           exchangeOrderId: result.exchangeOrderId,
           traceToken: params.traceToken 
         },
         'Bitget: Order executed successfully'
       );
       
       return result;
     }
     
     private async placeSLTP(
       symbol: string,
       side: string,
       amount: number,
       sl?: number,
       tp?: number
     ): Promise<void> {
       if (sl) {
         await this.exchange.createOrder(
           symbol,
           'stop_market',
           side === 'buy' ? 'sell' : 'buy',
           amount,
           undefined,
           { stopPrice: sl }
         );
       }
       
       if (tp) {
         await this.exchange.createOrder(
           symbol,
           'take_profit_market',
           side === 'buy' ? 'sell' : 'buy',
           amount,
           undefined,
           { stopPrice: tp }
         );
       }
     }
     
     async cancelOrder(orderId: string, symbol: string): Promise<void> {
       this.logger.info({ orderId, symbol }, 'Bitget: Cancelling order');
       const exchangeSymbol = this.lookupSymbol(symbol);
       await this.exchange.cancelOrder(orderId, exchangeSymbol);
     }
     
     async updateStopLoss(orderId: string, slPrice: number): Promise<void> {
       this.logger.info({ orderId, slPrice }, 'Bitget: Updating stop loss');
       // Bitget requires canceling old SL and placing new one
       // Implementation depends on how we track SL order IDs
     }
     
     async updateTakeProfit(orderId: string, tpPrice: number): Promise<void> {
       this.logger.info({ orderId, tpPrice }, 'Bitget: Updating take profit');
       // Similar to updateStopLoss
     }
     
     async fetchPrice(symbol: string): Promise<PriceTicker> {
       const exchangeSymbol = this.lookupSymbol(symbol);
       const ticker = await this.exchange.fetchTicker(exchangeSymbol);
       
       return {
         symbol,
         bid: ticker.bid || 0,
         ask: ticker.ask || 0,
         timestamp: ticker.timestamp || Date.now(),
       };
     }
     
     async getAccountInfo(): Promise<AccountInfo> {
       const balance = await this.exchange.fetchBalance();
       const usdtBalance = balance['USDT'] || {};
       
       return {
         balance: usdtBalance.total || 0,
         equity: usdtBalance.total || 0,
         margin: usdtBalance.used || 0,
         freeMargin: usdtBalance.free || 0,
       };
     }
     
     getName(): string {
       return 'Bitget';
     }
     
     getExchangeCode(): string {
       return this.brokerConfig.exchangeCode;
     }
     
     private lookupSymbol(symbol: string): string {
       // Symbol mapping for Bitget
       const mapping: Record<string, string> = {
         'BTCUSDT': 'BTC/USDT:USDT',
         'ETHUSDT': 'ETH/USDT:USDT',
         'XAUUSD': 'XAU/USDT:USDT',
       };
       return mapping[symbol] || symbol;
     }
   }
   ```

3. Update `apps/executor-service/src/adapters/factory.ts`:
   ```typescript
   import { BitgetAdapter } from './bitget/bitget.adapter';
   
   // In createAdapter():
   case 'bitget':
     return new BitgetAdapter(
       account.accountId,
       brokerConfig,
       this.logger
     );
   ```

4. Update `libs/dal/src/models/account.model.ts`:
   ```typescript
   exchangeCode: 'mock' | 'bitget' | 'xm' | 'exness' | 'binanceusdm' | 'oanda';
   ```

**Validation**:
- Integration test with Bitget testnet
- Order placement → SL/TP → cancellation flow
- **traceToken logged in all operations**

**Integration Test**:
```typescript
// test/integration/adapters/bitget.adapter.spec.ts
describe('BitgetAdapter integration', () => {
  it('should execute order with traceToken', async () => {
    const adapter = new BitgetAdapter('acc-1', config, logger);
    await adapter.init();
    
    const result = await adapter.executeOrder({
      orderId: 'order-123',
      symbol: 'BTCUSDT',
      type: OrderType.LONG,
      executionType: OrderExecutionType.market,
      lotSize: 0.01,
      price: 50000,
      traceToken: 'trace-abc-123', // Verify logged
    });
    
    expect(result.exchangeOrderId).toBeDefined();
  });
});
```

**Dependencies**: Task 2.4 (Factory)

---

### apps/executor-service/src/adapters/xm: XM Adapter (Token-based)

#### Task 7.2: Implement XM Adapter with Token Management
**Objective**: Add XM (MT5 web terminal) support with access/refresh token authentication

**Priority**: Medium (future need)

**Changes**:
1. Create `apps/executor-service/src/adapters/xm/xm.adapter.ts`:
   ```typescript
   import { BaseBrokerAdapter } from '../base.adapter';
   import { ExecuteOrderParams, ExecuteOrderResult, PriceTicker, AccountInfo } from '../interfaces';
   import { Account } from '@dal';
   import { LoggerInstance } from '@telegram-trading-bot-mini/shared/utils';
   import { TokenManager } from '../../services/token-manager.service';
   
   export class XMAdapter extends BaseBrokerAdapter {
     private serverUrl: string;
     private exchangeAccountId: string;
     
     constructor(
       private account: Account,
       private tokenManager: TokenManager,
       logger: LoggerInstance
     ) {
       super(account.accountId, logger);
       this.serverUrl = account.brokerConfig.serverUrl!;
       this.exchangeAccountId = account.brokerConfig.exchangeAccountId!;
     }
     
     async init(): Promise<void> {
       this.logger.info({ accountId: this.accountId }, 'Initializing XM adapter');
       
       // Validate config
       if (!this.serverUrl || !this.exchangeAccountId) {
         throw new Error('XM adapter requires serverUrl and exchangeAccountId');
       }
       
       // Test connection with current token
       await this.testConnection();
       
       this.isReady = true;
       this.logger.info({ accountId: this.accountId }, 'XM adapter initialized');
     }
     
     async close(): Promise<void> {
       this.logger.info({ accountId: this.accountId }, 'Closing XM adapter');
       this.isReady = false;
     }
     
     async executeOrder(params: ExecuteOrderParams): Promise<ExecuteOrderResult> {
       this.logger.info(
         { 
           orderId: params.orderId,
           symbol: params.symbol,
           traceToken: params.traceToken 
         },
         'XM: Executing order'
       );
       
       const headers = await this.getAuthHeaders();
       const symbol = this.lookupSymbol(params.symbol);
       
       const response = await fetch(`${this.serverUrl}/api/trade/open`, {
         method: 'POST',
         headers,
         body: JSON.stringify({
           account: this.exchangeAccountId,
           symbol,
           type: params.type === 'LONG' ? 'buy' : 'sell',
           lots: params.lotSize,
           price: params.price,
           sl: params.sl,
           tp: params.tp,
           traceToken: params.traceToken, // Pass through for logging
         }),
       });
       
       if (response.status === 401) {
         // Token expired, retry with fresh token
         this.tokenManager.invalidateToken(this.account);
         return this.executeOrder(params); // Retry once
       }
       
       if (!response.ok) {
         throw new Error(`XM order failed: ${response.statusText}`);
       }
       
       const data = await response.json();
       
       const result: ExecuteOrderResult = {
         exchangeOrderId: data.orderId,
         executedPrice: data.price,
         executedLots: data.lots,
         actualSymbol: symbol,
         executedAt: Date.now(),
       };
       
       this.logger.info(
         { 
           orderId: params.orderId,
           exchangeOrderId: result.exchangeOrderId,
           traceToken: params.traceToken 
         },
         'XM: Order executed successfully'
       );
       
       return result;
     }
     
     async cancelOrder(orderId: string, symbol: string): Promise<void> {
       this.logger.info({ orderId, symbol }, 'XM: Cancelling order');
       const headers = await this.getAuthHeaders();
       
       await fetch(`${this.serverUrl}/api/trade/close`, {
         method: 'POST',
         headers,
         body: JSON.stringify({
           account: this.exchangeAccountId,
           orderId,
         }),
       });
     }
     
     async updateStopLoss(orderId: string, slPrice: number): Promise<void> {
       this.logger.info({ orderId, slPrice }, 'XM: Updating stop loss');
       const headers = await this.getAuthHeaders();
       
       await fetch(`${this.serverUrl}/api/trade/modify`, {
         method: 'POST',
         headers,
         body: JSON.stringify({
           account: this.exchangeAccountId,
           orderId,
           sl: slPrice,
         }),
       });
     }
     
     async updateTakeProfit(orderId: string, tpPrice: number): Promise<void> {
       this.logger.info({ orderId, tpPrice }, 'XM: Updating take profit');
       const headers = await this.getAuthHeaders();
       
       await fetch(`${this.serverUrl}/api/trade/modify`, {
         method: 'POST',
         headers,
         body: JSON.stringify({
           account: this.exchangeAccountId,
           orderId,
           tp: tpPrice,
         }),
       });
     }
     
     async fetchPrice(symbol: string): Promise<PriceTicker> {
       const headers = await this.getAuthHeaders();
       const exchangeSymbol = this.lookupSymbol(symbol);
       
       const response = await fetch(
         `${this.serverUrl}/api/market/price?symbol=${exchangeSymbol}&account=${this.exchangeAccountId}`,
         { headers }
       );
       
       const data = await response.json();
       
       return {
         symbol,
         bid: data.bid,
         ask: data.ask,
         timestamp: Date.now(),
       };
     }
     
     async getAccountInfo(): Promise<AccountInfo> {
       const headers = await this.getAuthHeaders();
       
       const response = await fetch(
         `${this.serverUrl}/api/account/info?account=${this.exchangeAccountId}`,
         { headers }
       );
       
       const data = await response.json();
       
       return {
         balance: data.balance,
         equity: data.equity,
         margin: data.margin,
         freeMargin: data.freeMargin,
       };
     }
     
     getName(): string {
       return 'XM';
     }
     
     getExchangeCode(): string {
       return 'xm';
     }
     
     /**
      * Get auth headers with valid access token
      * TokenManager handles refresh automatically
      */
     private async getAuthHeaders(): Promise<Record<string, string>> {
       const accessToken = await this.tokenManager.getAccessToken(this.account);
       
       return {
         'Authorization': `Bearer ${accessToken}`,
         'Content-Type': 'application/json',
       };
     }
     
     private async testConnection(): Promise<void> {
       const headers = await this.getAuthHeaders();
       const response = await fetch(`${this.serverUrl}/api/health`, { headers });
       
       if (!response.ok) {
         throw new Error('XM connection test failed');
       }
     }
     
     private lookupSymbol(symbol: string): string {
       const mapping: Record<string, string> = {
         'XAUUSD': 'GOLD',
         'BTCUSD': 'BITCOIN',
       };
       return mapping[symbol] || symbol;
     }
   }
   ```

2. Update factory:
   ```typescript
   case 'xm':
     return new XMAdapter(
       account,
       this.tokenManager,
       this.logger
     );
   ```

**Validation**:
- Integration test with XM demo account
- Token refresh tested (simulate expiry)
- **traceToken propagated through all API calls**
- **Order.history updated on each operation**

**Integration Test**:
```typescript
// test/integration/adapters/xm.adapter.spec.ts
describe('XMAdapter integration', () => {
  it('should execute order with token auth and traceToken', async () => {
    const adapter = new XMAdapter(account, tokenManager, logger);
    await adapter.init();
    
    const result = await adapter.executeOrder({
      orderId: 'order-456',
      symbol: 'XAUUSD',
      type: OrderType.LONG,
      executionType: OrderExecutionType.market,
      lotSize: 0.1,
      price: 2000,
      traceToken: 'trace-xm-789',
    });
    
    expect(result.exchangeOrderId).toBeDefined();
    // Verify traceToken was sent to XM API
  });
  
  it('should refresh token on 401 and retry', async () => {
    // Mock 401 response, then success
    // Verify TokenManager.getAccessToken called twice
  });
});
```

**Dependencies**: Task 2.4 (Factory), TokenManager implementation

---

### apps/executor-service/src/adapters/exness: Exness Adapter (Token-based)

#### Task 7.3: Implement Exness Adapter with Token Management
**Objective**: Add Exness (MT5 web terminal) support with access/refresh token authentication

**Priority**: Medium (future need)

**Changes**:
1. Create `apps/executor-service/src/adapters/exness/exness.adapter.ts`:
   - Similar structure to XMAdapter
   - Uses TokenManager for auth
   - Exness-specific API endpoints
   - Symbol mapping for Exness
   - **Propagate traceToken in all API calls**
   - **Log traceToken in all operations**

2. Update factory:
   ```typescript
   case 'exness':
     return new ExnessAdapter(
       account,
       this.tokenManager,
       this.logger
     );
   ```

**Validation**:
- Integration test with Exness demo account
- Token refresh tested
- **traceToken logged and propagated**
- **Order.history updated**

**Dependencies**: Task 7.2 (can reuse XM pattern)

---

### apps/trade-manager: Update Order History

#### Task 7.4: Ensure Order.history Updates on All Operations
**Objective**: Update Order.history field for all order lifecycle events

**Changes**:
1. Edit `apps/trade-manager/src/events/consumers/execution-result-handler.ts`:
   - Already updates history on EXECUTE_ORDER_RESULT
   - **Ensure traceToken included in history entry**

2. Add history updates for:
   - Order cancellation
   - SL/TP modifications
   - Any order state changes

**Example**:
```typescript
await orderRepository.updateOne(
  { orderId },
  {
    $push: {
      history: {
        event: 'EXECUTED',
        timestamp: payload.executedAt,
        traceToken: payload.traceToken, // Include traceToken
        data: payload,
      },
    },
  }
);
```

**Validation**:
- Integration test verifying Order.history contains all events
- Each history entry includes traceToken

**Dependencies**: Tasks 4.2, 7.1-7.3

---

## Summary & Dependencies

### Task Grouping by Service/Library

**libs/shared/utils**: Tasks 1.1, 1.2, 1.3, 1.4 (Message contracts)

**libs/dal**: Task 1.5 (Account model extension)

**apps/executor-service**: 
- Infrastructure: Tasks 1.6-1.9
- Adapters: Tasks 2.1-2.7
- Services: Tasks 3.1-3.6
- Price Feed: Tasks 5.1-5.3
- Testing/Docs: Tasks 6.1-6.4

**apps/trade-manager**: Tasks 4.1-4.3, 5.4 (Integration)

### Critical Path

1. **Foundation** (Week 1): Tasks 1.1-1.9 (Message contracts, service scaffolding)
2. **Adapters** (Week 2-3): Tasks 2.1-2.7 (Broker abstractions, CCXT, Oanda)
3. **Services** (Week 3-4): Tasks 3.1-3.6 (Order executor, event handling, server)
4. **Integration** (Week 5): Tasks 4.1-4.3 (Trade-manager connection)
5. **Price Feed** (Week 6): Tasks 5.1-5.4 (Price updates)
6. **Finalization** (Week 6): Tasks 6.1-6.4 (Testing, documentation, deployment)

### Estimated Total Time: 4-6 weeks

- **Week 1-2**: Foundation + Adapter infrastructure
- **Week 3-4**: Broker implementations + Services
- **Week 5**: Trade-manager integration + Testing
- **Week 6**: Price feed + Documentation + Deployment

