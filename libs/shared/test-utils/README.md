# @telegram-trading-bot-mini/shared/test-utils

**Internal Test Utilities** - Not published, used only within the monorepo for testing.

Test utilities library providing reusable helpers for testing across all libraries and applications in the monorepo.

> **Note**: This library is internal-only and not built/published. TypeScript compiles it on-the-fly when running tests.

## Purpose

Centralized test utilities to avoid duplication and ensure consistent testing patterns across all libraries and applications.

## Exports

### Logger Helpers

#### `fakeLogger`
A ready-to-use fake logger instance with all methods mocked using `jest.fn()`.

```typescript
import { fakeLogger } from '@telegram-trading-bot-mini/shared/test-utils';

await init(config, fakeLogger);

// Assert on calls
expect(fakeLogger.info).toHaveBeenCalledWith('Connected successfully to server');
```

#### `mockRootLogger(rootLogger)`
Mock a root logger's `child()` method to return a jest-mocked logger.

```typescript
import { mockRootLogger } from '@telegram-trading-bot-mini/shared/test-utils';

const mockLogger = mockRootLogger(rootLogger);
// Now rootLogger.child() returns mockLogger
```

### Suite Helpers

#### `suiteName(file)`
Generate hierarchical test suite names from file paths.

```typescript
import { suiteName } from '@telegram-trading-bot-mini/shared/test-utils';

describe(suiteName(__filename), () => {
  // Test suite name: 'libs#dal#test#infra#db.spec.ts'
});
```

## Usage

```typescript
// Import specific helpers
import { fakeLogger, suiteName } from '@telegram-trading-bot-mini/shared/test-utils';

// Or import all
import * as testUtils from '@telegram-trading-bot-mini/shared/test-utils';
```

## Dependencies

- `@types/jest` - Required for Jest type definitions
- `pino` - For Logger type (imported directly to avoid circular dependencies)
