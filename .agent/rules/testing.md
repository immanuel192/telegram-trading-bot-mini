---
trigger: glob
description: Testing standards, structure, and execution
globs: test/*.*
---

# Testing Rules

## 7. Testing Rules

### 7.1 Structure

* Tests live under: `apps/<app-name>/test/`.
* Test filenames must follow: `*.spec.ts`.
* Use `describe` and `it` blocks.
* Test setup lives in `apps/<app-name>/test/setup.ts`.
* Jest config lives per app in `jest.config.ts`. Use one jest setup for both unit test and integration test

### 7.2 Execution

* Run tests using: `npx nx test <app-name>`.
* Available apps: `telegram-service`, `interpret-service`, `trade-manager`.

### 7.3 Behavioral Rules

* Sentry is auto-mocked in global test setup.
* All tests must map directly to acceptance criteria in the spec.
* Avoid mocking entire packages unless absolutely required.
* Prefer real contracts and fixtures for reliability.

### 7.4 Mock restriction
* Do not mock config. Use default config
