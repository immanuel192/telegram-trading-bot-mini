---
name: run-test-and-debug-test
description: Comprehensive guide for running and debugging integration and unit tests within the monorepo.
---

# Run and Debug Tests Skill

This skill provides a structured approach to executing and troubleshooting tests across the various services in the telegram-trading-bot-mini monorepo.

## 1. Running Tests

To execute tests for a specific file, use the Nx CLI with the following syntax:

```bash
npx nx test <app-name> -- <file-name>.spec.ts
```

### Target Applications
Choose the correct `<app-name>` context based on the module you are testing:
- **executor-service**: Order execution logic and broker integrations.
- **trade-manager**: Trade lifecycle and position management.
- **interpret-service**: AI signal interpretation and prompt logic.
- **dal**: Data Access Layer and database models.
- **shared-utils**: Common utility functions and helpers.

## 2. Debugging Workflow

Follow these systematic steps to resolve test failures efficiently:

### Phase 1: Initial Log Analysis
- Review the standard output and error logs.
- Identify the specific assertion failure or runtime exception.

### Phase 2: Test Isolation
- If the test suite is large, narrow down the execution scope to a single block.
- Use `.only` on `describe` or `it` blocks (e.g., `describe.only('...', ...)` or `it.only('...', ...)`).
- This minimizes noise and accelerates the debugging cycle.

### Phase 3: Reveal Hidden Logs
- Projects often mock the logger in their `setup.ts` file to keep test output clean.
- If you need more visibility into the internal service logic:
    1. Locate the `setup.ts` file in the relevant project.
    2. Find the code block where the logger is mocked (e.g., `jest.mock('@/logger', ...)`).
    3. **Temporarily** comment out this mock to enable real-time log output during the test run.

### Phase 4: Troubleshooting Redis Streams
- **IMPORTANT**: If a test involving Redis streams (Upstash/Redis) hangs or times out, **DO NOT** increase the Jest timeout.
- Timeout issues in these streams are typically symptomatic of logic errors, incorrect stream keys, or missing event triggers, not execution speed.
- Increasing the timeout will only delay the report of the failure and mask the root cause.

## 3. Cleanup Checklist
Prior to finalizing a fix:
- [ ] Remove all `.only` decorators.
- [ ] Restore any modified `setup.ts` logger mocks.
- [ ] Ensure the test passes consistently without manual intervention.
