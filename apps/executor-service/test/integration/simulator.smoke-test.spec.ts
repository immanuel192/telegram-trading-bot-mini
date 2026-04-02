/**
 * Simulator Smoke Test
 *
 * Purpose: Demonstrates the integration testing infrastructure and the
 * pluggable broker architecture using the Mock Simulator.
 *
 * Highlights:
 * - Docker-based integration testing (MongoDB/Redis)
 * - Repository pattern for data access
 * - Broker-agnostic abstraction
 */

import { startServer, stopServer, ServerContext } from '../../src/server';
import { createMockAccount } from './test-helpers';

describe('Simulator Smoke Test', () => {
  let serverContext: ServerContext;

  beforeAll(async () => {
    // Initialize the full server context (Wiring up DI, DB, Redis, Consumers, Jobs)
    serverContext = await startServer();
  });

  afterAll(async () => {
    // Graceful shutdown of all services and testing infrastructure
    // This handles closing DB connections and stopping consumers/jobs
    await stopServer(serverContext);
  });

  it('should successfully fetch a price from the Simulator', async () => {
    // 1. Setup: Create a test account using the Mock/Simulator broker
    const accountId = 'simulator-acc';
    await createMockAccount(serverContext, accountId);

    // 2. Execute: Get the broker adapter from the factory
    const adapter = await serverContext.container.brokerFactory.getAdapter(
      accountId
    );
    const symbol = 'XAUUSD';
    const prices = await adapter.fetchPrice([symbol]);

    // 3. Verify: Check that the Simulator returned valid mock data
    expect(prices).toHaveLength(1);
    expect(prices[0].symbol).toBe(symbol);
    expect(prices[0].bid).toBeGreaterThan(0);
    expect(prices[0].ask).toBeGreaterThan(prices[0].bid);

    console.log(
      `Simulator Price for ${symbol}: Bid=${prices[0].bid}, Ask=${prices[0].ask}`
    );
  });

  it('should demonstrate the end-to-end command flow on the Simulator', async () => {
    const accountId = 'simulator-acc';

    // Demonstrate the "Wiring" by calling a service method
    // that would normally interact with a real exchange API.
    const adapter = await serverContext.container.brokerFactory.getAdapter(
      accountId
    );
    const accountInfo = await adapter.getAccountInfo();

    expect(accountInfo.balance).toBeDefined();
    expect(accountInfo.equity).toBeDefined();

    console.log(`Simulator Account Balance: ${accountInfo.balance}`);
  });
});
