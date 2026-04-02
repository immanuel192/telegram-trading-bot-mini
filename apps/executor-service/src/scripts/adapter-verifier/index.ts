#!/usr/bin/env tsx
/**
 * Purpose: Interactive CLI for testing OrderExecutorService with different adapters
 * Exports: Main CLI script
 * Core Flow: Init DB → Seed Account → Create Container → Run Test Cases → Verify DB State
 *
 * Usage:
 *   1. Update seed-account.json with your broker credentials
 *   2. Run: nx run executor-service:adapter-verifier
 *   3. Select test case or run all
 *   4. Inspect results and DB state
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';
import pino from 'pino';
import { createConfig } from '@telegram-trading-bot-mini/shared/utils';
import { init as initDb, close as closeDb, COLLECTIONS, mongoDb } from '@dal';
import { AccountRepository, OrderRepository } from '@dal';
import { Account, Order } from '@dal';
import { createContainer } from '../../container';
import { allTestCases, TestCase } from './test-cases';

// Create logger
const logger = pino({
  level: 'info',
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true,
    },
  },
});

// Create readline interface
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

/**
 * Prompt user for input
 */
function prompt(question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      resolve(answer.trim());
    });
  });
}

/**
 * Load account from seed-account.json
 */
function loadSeedAccount(): Account {
  const seedPath = path.join(__dirname, 'seed-account.json');
  if (!fs.existsSync(seedPath)) {
    throw new Error(
      `seed-account.json not found at ${seedPath}. Please create it first.`,
    );
  }

  const seedData = JSON.parse(fs.readFileSync(seedPath, 'utf-8'));
  return seedData as Account;
}

/**
 * Display test case menu
 */
function displayMenu() {
  console.log('\n' + '='.repeat(80));
  console.log('🧪 ADAPTER VERIFIER - Test OrderExecutorService');
  console.log('='.repeat(80));
  console.log('\nAvailable Test Cases:');
  console.log('─'.repeat(80));

  allTestCases.forEach((tc) => {
    console.log(`  ${tc.id}. ${tc.name.padEnd(25)} - ${tc.description}`);
  });

  console.log(`  ${allTestCases.length + 1}. Run All Test Cases`);
  console.log('  0. Exit');
  console.log('─'.repeat(80));
}

/**
 * Clean up database collections
 */
async function cleanupDb(
  targetCollections: COLLECTIONS[] = [COLLECTIONS.ACCOUNT, COLLECTIONS.ORDERS],
): Promise<void> {
  if (!mongoDb) {
    throw new Error('Database not initialized. Call initDb() first.');
  }

  await Promise.all(
    targetCollections.map((col) => mongoDb.collection(col).deleteMany({})),
  );
}

/**
 * Seed account into database
 */
async function seedAccountData(
  accountRepo: AccountRepository,
  accountData: Account,
): Promise<void> {
  logger.info({ accountId: accountData.accountId }, 'Seeding account...');

  // Check if account already exists
  const existing = await accountRepo.findOne({
    accountId: accountData.accountId,
  });

  if (existing) {
    logger.info('Account already exists, updating...');
    await accountRepo.update(accountData.accountId, accountData);
  } else {
    await accountRepo.create(accountData);
  }

  logger.info('✅ Account seeded successfully');
}

/**
 * Seed orders for a test case
 */
async function seedOrders(
  orderRepo: OrderRepository,
  orders: Partial<Order>[],
): Promise<void> {
  logger.info({ count: orders.length }, 'Seeding orders...');

  for (const order of orders) {
    await orderRepo.create(order as Order);
  }

  logger.info('✅ Orders seeded successfully');
}

/**
 * Verify DB state after execution
 */
async function verifyDbState(
  orderRepo: OrderRepository,
  testCase: TestCase,
): Promise<void> {
  logger.info('🔍 Verifying DB state...');

  const order = await orderRepo.findOne({ orderId: testCase.payload.orderId });

  if (!order) {
    logger.error('❌ Order not found in DB!');
    return;
  }

  const { expectedDbState } = testCase;
  let allPassed = true;

  // Check status
  if (expectedDbState.status && order.status !== expectedDbState.status) {
    logger.error(
      `❌ Status mismatch: expected ${expectedDbState.status}, got ${order.status}`,
    );
    allPassed = false;
  } else if (expectedDbState.status) {
    logger.info(`✅ Status: ${order.status}`);
  }

  // Check history count
  if (
    expectedDbState.historyCount &&
    order.history.length !== expectedDbState.historyCount
  ) {
    logger.error(
      `❌ History count mismatch: expected ${expectedDbState.historyCount}, got ${order.history.length}`,
    );
    allPassed = false;
  } else if (expectedDbState.historyCount) {
    logger.info(`✅ History count: ${order.history.length}`);
  }

  // Check last history status
  if (expectedDbState.historyLastStatus) {
    const lastHistory = order.history[order.history.length - 1];
    if (lastHistory.status !== expectedDbState.historyLastStatus) {
      logger.error(
        `❌ Last history status mismatch: expected ${expectedDbState.historyLastStatus}, got ${lastHistory.status}`,
      );
      allPassed = false;
    } else {
      logger.info(`✅ Last history status: ${lastHistory.status}`);
    }
  }

  // Check specific fields
  if (expectedDbState.checkFields) {
    for (const field of expectedDbState.checkFields) {
      const value = getNestedValue(order, field);
      if (value === undefined || value === null) {
        logger.error(`❌ Field ${field} is missing or null`);
        allPassed = false;
      } else {
        logger.info(`✅ Field ${field}: ${JSON.stringify(value)}`);
      }
    }
  }

  // Display full order for inspection
  console.log('\n' + '─'.repeat(80));
  console.log('📋 Full Order State:');
  console.log('─'.repeat(80));
  console.log(JSON.stringify(order, null, 2));
  console.log('─'.repeat(80));

  if (allPassed) {
    logger.info('✅ All verifications passed!');
  } else {
    logger.warn('⚠️  Some verifications failed. Check logs above.');
  }
}

/**
 * Get nested value from object using dot notation
 */
function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((current, key) => current?.[key], obj);
}

/**
 * Run a single test case
 */
async function runTestCase(
  testCase: TestCase,
  orderRepo: OrderRepository,
  container: any,
): Promise<void> {
  console.log('\n' + '='.repeat(80));
  logger.info(
    { testCase: testCase.name },
    `Running Test Case ${testCase.id}: ${testCase.name}`,
  );
  console.log('='.repeat(80));

  try {
    // Check if prerequisite test case needs to run first
    if (testCase.prerequisiteTestCaseId) {
      const prerequisiteTest = allTestCases.find(
        (tc) => tc.id === testCase.prerequisiteTestCaseId,
      );

      if (prerequisiteTest) {
        logger.info(
          {
            prerequisiteId: prerequisiteTest.id,
            prerequisiteName: prerequisiteTest.name,
          },
          '📋 Running prerequisite test case first...',
        );
        await runTestCase(prerequisiteTest, orderRepo, container);
        logger.info('✅ Prerequisite test completed');
      }
    }

    // Seed orders (only if there are any)
    if (testCase.seedOrders.length > 0) {
      await seedOrders(orderRepo, testCase.seedOrders);
    }

    // Execute order
    logger.info('🚀 Executing order...');
    await container.pipelineExecutor.executeOrder(testCase.payload);
    logger.info('✅ Order executed successfully');

    // Verify DB state
    await verifyDbState(orderRepo, testCase);
  } catch (error) {
    logger.error({ error }, '❌ Test case failed');
    console.error(error);
  }

  console.log('='.repeat(80));
}

/**
 * Main function
 */
async function main() {
  let container: any = null;

  try {
    console.log('\n🚀 Starting Adapter Verifier...\n');

    // Step 1: Load seed account
    logger.info('Step 1: Loading seed account...');
    const seedAccount = loadSeedAccount();
    logger.info(
      {
        accountId: seedAccount.accountId,
        exchangeCode: seedAccount.brokerConfig?.exchangeCode,
      },
      '✅ Seed account loaded',
    );

    // Step 2: Initialize DB
    logger.info('Step 2: Initializing database...');
    const config = createConfig({
      MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017',
      MONGODB_DBNAME:
        process.env.MONGODB_DBNAME || 'telegram-trading-bot-mini-test',
    });
    await initDb(config, logger);
    logger.info('✅ Database initialized');

    // Step 3: Clean up DB
    logger.info('Step 3: Cleaning up database...');
    await cleanupDb([COLLECTIONS.ACCOUNT, COLLECTIONS.ORDERS]);
    logger.info('✅ Database cleaned');

    // Step 4: Seed account
    logger.info('Step 4: Seeding account...');
    const accountRepo = new AccountRepository();
    await seedAccountData(accountRepo, seedAccount);

    // Step 5: Create container
    logger.info('Step 5: Creating container...');
    container = await createContainer();
    logger.info('✅ Container created');

    // Step 6: Initialize repositories
    const orderRepo = new OrderRepository();

    // Step 7: Interactive menu
    let running = true;
    while (running) {
      displayMenu();
      const choice = await prompt('\nEnter your choice: ');
      const choiceNum = parseInt(choice, 10);

      if (isNaN(choiceNum)) {
        console.log('❌ Invalid choice. Please enter a number.');
        continue;
      }

      if (choiceNum === 0) {
        running = false;
        console.log('\n👋 Exiting...\n');
      } else if (choiceNum === allTestCases.length + 1) {
        // Run all test cases
        console.log('\n🏃 Running all test cases...\n');
        for (const testCase of allTestCases) {
          await runTestCase(testCase, orderRepo, container);
          await new Promise((resolve) => setTimeout(resolve, 1000)); // Small delay between tests
        }
        console.log('\n✅ All test cases completed!\n');
      } else if (choiceNum >= 1 && choiceNum <= allTestCases.length) {
        // Run specific test case
        const testCase = allTestCases[choiceNum - 1];
        await runTestCase(testCase, orderRepo, container);
      } else {
        console.log('❌ Invalid choice. Please try again.');
      }
    }
  } catch (error) {
    logger.error({ error }, '❌ Fatal error');
    console.error(error);
    process.exit(1);
  } finally {
    // Cleanup
    rl.close();
    await closeDb();
    logger.info('👋 Database connection closed');
  }
}

// Run main
main();
