# Tasks: Setup GitHub Actions CI

## Overview
This document outlines the implementation tasks for setting up GitHub Actions CI/CD pipeline. Tasks are ordered to deliver incremental, verifiable progress.

---

## Phase 1: Docker Test Environment Setup

### Task 1.1: Create Docker Compose Test Environment
**Estimated Effort**: 45 minutes  
**Dependencies**: None  
**Validation**: Docker Compose starts test runner with correct environment variables

**Steps**:
1. Create `docker-compose.test.yml` in repository root
2. Define `test-runner` service using `node:20.19.5` image
3. Configure volume mount: `.:/app`
4. Set working directory to `/app`
5. Add to `telegram-trading-bot` network
6. Add depends_on for `mongo`, `redis`, `upstash-serverless-redis-http`
7. Configure environment variables:
   - `CI=true`
   - `NODE_ENV=test`
   - `MONGODB_URI=mongodb://mongo:27017/?replicaSet=rs0&directConnection=true`
   - `MONGODB_DBNAME=telegram-trading-bot-test`
   - `REDIS_URL=redis://redis:6379`
   - `UPSTASH_REDIS_REST_URL=http://upstash-serverless-redis-http:80`
   - `UPSTASH_REDIS_REST_TOKEN=fake-token`
8. Set command to `tail -f /dev/null` (keeps container running)
9. Test locally: 
   - `npm run stack:down` (ensure clean state)
   - `docker-compose -f docker-compose.yml -f docker-compose.test.yml up -d`
   - `docker-compose -f docker-compose.yml -f docker-compose.test.yml exec test-runner node --version` (verify Node.js 20.19.5)
   - `docker-compose -f docker-compose.yml -f docker-compose.test.yml down`

**Acceptance Criteria**:
- [ ] docker-compose.test.yml exists in repository root
- [ ] test-runner service uses Node.js v20.19.5
- [ ] Source code is mounted as volume at /app
- [ ] Service connects to telegram-trading-bot network
- [ ] All environment variables are set correctly
- [ ] All services start successfully together
- [ ] Can execute commands inside test-runner container

---

### Task 1.2: Update Test Utilities for CI Environment
**Estimated Effort**: 1.5 hours  
**Dependencies**: Task 1.1  
**Validation**: All integration tests can detect CI environment and use correct connection strings

**Steps**:
1. Create `libs/shared/test-utils/src/lib/environment.helpers.ts`
2. Define `TestEnvironment` enum:
   ```typescript
   export enum TestEnvironment {
     LOCAL = 'local',
     DOCKER = 'docker',
     CI = 'ci'
   }
   ```
3. Create `detectTestEnvironment()` function:
   - Check for `CI=true` environment variable → return `TestEnvironment.CI`
   - Check for `DOCKER=true` or hostname contains 'docker' → return `TestEnvironment.DOCKER`
   - Default → return `TestEnvironment.LOCAL`
4. Create `getTestMongoUri()` function:
   - For `CI` or `DOCKER`: return `mongodb://mongo:27017/?replicaSet=rs0&directConnection=true`
   - For `LOCAL`: return `mongodb://localhost:27017/?replicaSet=rs0&directConnection=true`
5. Create `getTestRedisUrl()` function:
   - For `CI` or `DOCKER`: return `http://upstash-serverless-redis-http:80`
   - For `LOCAL`: return `http://localhost:8000`
6. Create `getTestRedisToken()` function:
   - Return `'fake-token'` (same for all environments)
7. Update `libs/shared/test-utils/src/lib/db.helpers.ts`:
   - Import `getTestMongoUri`
   - Update `setupDb()` to use `getTestMongoUri()` for MongoDB connection
   - Modify config creation to override `MONGODB_URI` with test URI
8. Export new helpers from `libs/shared/test-utils/src/index.ts`
9. Update integration tests to use environment helpers:
   - `libs/shared/utils/test/integration/redis-stream.spec.ts`: Replace hardcoded `REDIS_URL` with `getTestRedisUrl()`
   - `libs/dal/test/repositories/base.repository.spec.ts`: Already uses `createConfig()`, verify it picks up env vars
   - `libs/dal/test/repositories/telegram-channel.repository.spec.ts`: Verify config usage
   - `libs/dal/test/repositories/telegram-message.repository.spec.ts`: Verify config usage
   - `libs/dal/test/repositories/config.repository.spec.ts`: Verify config usage
   - `libs/dal/test/infra/db.spec.ts`: Verify config usage
10. Test locally:
    - Run `npm run stack:up`
    - Run `npx nx test shared-utils` (should use localhost)
    - Run `npx nx test dal` (should use localhost)
    - `npm run stack:down`
11. Test in Docker container:
    - `npm run stack:down`
    - `docker-compose -f docker-compose.yml -f docker-compose.test.yml up -d`
    - `docker-compose -f docker-compose.yml -f docker-compose.test.yml exec test-runner npx nx test shared-utils`
    - `docker-compose -f docker-compose.yml -f docker-compose.test.yml exec test-runner npx nx test dal`
    - `docker-compose -f docker-compose.yml -f docker-compose.test.yml down`

**Acceptance Criteria**:
- [ ] TestEnvironment enum is defined
- [ ] detectTestEnvironment() correctly identifies environment
- [ ] getTestMongoUri() returns correct URI for each environment
- [ ] getTestRedisUrl() returns correct URL for each environment
- [ ] getTestRedisToken() returns token
- [ ] db.helpers.ts uses getTestMongoUri()
- [ ] redis-stream.spec.ts uses getTestRedisUrl()
- [ ] All DAL integration tests work with environment-aware config
- [ ] Tests pass locally (without Docker)
- [ ] Tests pass in Docker container
- [ ] Environment detection works correctly in all scenarios

---

## Phase 2: Test Execution Script

### Task 2.1: Create Test Execution Script
**Estimated Effort**: 45 minutes  
**Dependencies**: Task 1.2  
**Validation**: Script runs all tests successfully in Docker container

**Steps**:
1. Create `.github/scripts/` directory
2. Create `run-tests.sh` script
3. Add shebang `#!/bin/bash` and `set -e` for fail-fast behavior
4. Set environment variable: `export CI=true`
5. Add npm install step: `npm ci`
6. Add service health check waits (MongoDB, Redis):
   ```bash
   echo "Waiting for MongoDB..."
   until nc -z mongo 27017; do sleep 1; done
   echo "Waiting for Redis..."
   until nc -z redis 6379; do sleep 1; done
   ```
7. Add sequential test execution for libs and apps:
   - `npx nx test shared-utils` (libs/shared/utils)
   - `npx nx test dal` (libs/dal)
   - `npx nx test telegram-service`
   - `npx nx test interpret-service`
   - `npx nx test trade-manager`
8. Add build step: `npx nx build telegram-service interpret-service trade-manager`
9. Add echo statements for progress tracking
10. Make script executable: `chmod +x .github/scripts/run-tests.sh`
11. Test locally:
    - `npm run stack:down` (ensure clean state)
    - `docker-compose -f docker-compose.yml -f docker-compose.test.yml up -d`
    - `docker-compose -f docker-compose.yml -f docker-compose.test.yml exec test-runner /app/.github/scripts/run-tests.sh`
    - `docker-compose -f docker-compose.yml -f docker-compose.test.yml down`

**Acceptance Criteria**:
- [ ] Script exists at `.github/scripts/run-tests.sh`
- [ ] Script is executable
- [ ] Script sets CI=true environment variable
- [ ] Script installs dependencies with `npm ci`
- [ ] Script waits for services to be ready
- [ ] Lib tests (shared-utils, dal) run sequentially before apps
- [ ] All app tests run sequentially
- [ ] Build executes for all apps
- [ ] Script exits with error code on failure
- [ ] Progress messages are clear and helpful
- [ ] Script runs successfully in Docker container locally

---

### Task 2.2: Add Coverage Reporting for CI
**Estimated Effort**: 30 minutes  
**Dependencies**: Task 2.1  
**Validation**: Coverage report is generated and displayed in CI logs

**Steps**:
1. Update `.github/scripts/run-tests.sh` to add coverage flag when running tests:
   - Change test commands to include `--coverage` flag:
     - `npx nx test shared-utils --coverage`
     - `npx nx test dal --coverage`
     - `npx nx test telegram-service --coverage`
     - `npx nx test interpret-service --coverage`
     - `npx nx test trade-manager --coverage`
2. Add coverage report combination step after all tests complete:
   ```bash
   echo "Generating combined coverage report..."
   # Install coverage tool if needed
   npx nyc merge coverage coverage/merged-coverage.json
   npx nyc report --reporter=text --reporter=text-summary --temp-dir=coverage
   ```
3. Alternative approach using Jest's built-in coverage merging:
   ```bash
   echo "Coverage Summary:"
   echo "================="
   # Display individual coverage reports
   cat coverage/libs/shared/utils/coverage-summary.json 2>/dev/null || echo "shared-utils: No coverage data"
   cat coverage/libs/dal/coverage-summary.json 2>/dev/null || echo "dal: No coverage data"
   cat coverage/apps/telegram-service/coverage-summary.json 2>/dev/null || echo "telegram-service: No coverage data"
   cat coverage/apps/interpret-service/coverage-summary.json 2>/dev/null || echo "interpret-service: No coverage data"
   cat coverage/apps/trade-manager/coverage-summary.json 2>/dev/null || echo "trade-manager: No coverage data"
   ```
4. Add simple text summary display:
   ```bash
   echo ""
   echo "Overall Coverage Summary:"
   find coverage -name "coverage-summary.json" -exec cat {} \; | jq -s 'reduce .[] as $item ({}; . + $item)' 2>/dev/null || echo "Coverage data available in coverage/ directory"
   ```
5. Ensure coverage directory is created and accessible
6. Test locally in Docker:
   - `npm run stack:down`
   - `docker-compose -f docker-compose.yml -f docker-compose.test.yml up -d`
   - `docker-compose -f docker-compose.yml -f docker-compose.test.yml exec test-runner /app/.github/scripts/run-tests.sh`
   - Verify coverage reports are generated in `coverage/` directory
   - Verify summary is displayed in console output
   - `docker-compose -f docker-compose.yml -f docker-compose.test.yml down`

**Acceptance Criteria**:
- [ ] Test commands include `--coverage` flag
- [ ] Coverage is only run in CI (not when running tests locally without Docker)
- [ ] Coverage reports are generated for all libs and apps
- [ ] Coverage summary is displayed in CI logs
- [ ] Coverage files are stored in `coverage/` directory
- [ ] Script completes successfully with coverage enabled
- [ ] Coverage report is readable and informative

**Note**: Coverage is only run in CI environment (inside Docker container). Local developers can run tests without coverage for faster feedback.

---

## Phase 3: GitHub Actions Workflow

### Task 3.1: Create Base CI Workflow
**Estimated Effort**: 1 hour  
**Dependencies**: Task 2.1  
**Validation**: Workflow triggers and runs on PR

**Steps**:
1. Create `.github/workflows/` directory
2. Create `ci.yml` workflow file
3. Define workflow name: "CI"
4. Add triggers:
   - `pull_request` for branches: `develop`, `main`
   - `push` for branch: `main`
5. Define `test-and-build` job:
   - runs-on: `ubuntu-latest`
   - timeout-minutes: 30
6. Add steps:
   - Checkout code (actions/checkout@v4)
   - Start dependencies: `docker-compose -f docker-compose.yml up -d`
   - Wait for services to be healthy (optional health check step)
   - Start test runner: `docker-compose -f docker-compose.yml -f docker-compose.test.yml up -d test-runner`
   - Run tests: `docker-compose -f docker-compose.yml -f docker-compose.test.yml exec -T test-runner /app/.github/scripts/run-tests.sh`
   - Stop services: `docker-compose -f docker-compose.yml -f docker-compose.test.yml down`
7. Test by creating a draft PR

**Acceptance Criteria**:
- [ ] Workflow file exists at `.github/workflows/ci.yml`
- [ ] Workflow triggers on PR to develop/main
- [ ] Workflow triggers on push to main
- [ ] Workflow has 30-minute timeout
- [ ] Docker services start successfully in CI
- [ ] Tests run in CI environment inside container
- [ ] Services are stopped after tests complete
- [ ] Workflow reports success/failure correctly

---

### Task 3.2: Add Caching to Workflow
**Estimated Effort**: 45 minutes  
**Dependencies**: Task 3.1  
**Validation**: Second workflow run uses cache and completes faster

**Steps**:
1. Add node_modules cache step using `actions/cache@v4`:
   - Key: `node-modules-${{ hashFiles('**/package-lock.json') }}`
   - Path: `node_modules`
   - Place before starting Docker services
2. Add Nx cache step:
   - Key: `nx-${{ hashFiles('**/package-lock.json') }}-${{ github.sha }}`
   - Restore keys: `nx-${{ hashFiles('**/package-lock.json') }}-`
   - Path: `.nx/cache`
3. Consider adding Docker image cache for `node:20.19.5` (optional, GitHub Actions caches this automatically)
4. Test by running workflow twice and comparing execution times

**Acceptance Criteria**:
- [ ] node_modules cache is configured
- [ ] Nx cache is configured
- [ ] Cache is restored before npm ci runs
- [ ] Second run shows cache hit in logs
- [ ] Second run completes faster than first run

---

### Task 3.3: Add Deployment Placeholder Job
**Estimated Effort**: 30 minutes  
**Dependencies**: Task 3.2  
**Validation**: Deployment job runs only on main branch push

**Steps**:
1. Add `deploy` job to workflow
2. Set condition: `if: github.ref == 'refs/heads/main' && github.event_name == 'push'`
3. Add `needs: [test-and-build]` dependency
4. Add placeholder step with comment:
   ```yaml
   - name: Deploy (Placeholder)
     run: |
       echo "Deployment step placeholder"
       echo "Future: Deploy to production environment"
   ```
5. Test by merging a PR to main

**Acceptance Criteria**:
- [ ] Deploy job is defined in workflow
- [ ] Deploy job only runs on push to main
- [ ] Deploy job depends on test-and-build success
- [ ] Placeholder step executes and logs message
- [ ] Workflow completes successfully with placeholder

---

## Phase 4: Documentation and Validation

### Task 4.1: Add CI Documentation
**Estimated Effort**: 30 minutes  
**Dependencies**: Task 3.3  
**Validation**: Documentation is clear and accurate

**Steps**:
1. Update root `README.md` with CI section:
   - Explain workflow triggers
   - Describe test execution process
   - Document how to run tests locally using Docker Compose
   - Document the two-file Docker Compose approach
2. Create `.github/workflows/README.md`:
   - Document workflow structure
   - Explain caching strategy
   - Provide troubleshooting tips
   - Explain environment variable configuration
3. Add comments to `docker-compose.test.yml` explaining its purpose and environment variables

**Acceptance Criteria**:
- [ ] Root README.md includes CI section
- [ ] Workflow README.md exists with comprehensive documentation
- [ ] Docker Compose test file has explanatory comments
- [ ] Documentation includes local testing instructions
- [ ] Documentation explains the local vs CI workflow difference

---

### Task 4.2: Validate OpenSpec Compliance
**Estimated Effort**: 15 minutes  
**Dependencies**: All previous tasks  
**Validation**: OpenSpec validation passes

**Steps**:
1. Run `openspec validate setup-github-actions-ci --strict`
2. Fix any validation errors
3. Verify all requirements have corresponding implementation
4. Ensure all scenarios are testable

**Acceptance Criteria**:
- [ ] OpenSpec validation passes with no errors
- [ ] All requirements are implemented
- [ ] All scenarios can be verified

---

### Task 4.3: End-to-End Testing
**Estimated Effort**: 1 hour  
**Dependencies**: Task 4.2  
**Validation**: Complete CI workflow works end-to-end

**Steps**:
1. Create a test branch with a small code change
2. Create PR to develop branch
3. Verify workflow triggers automatically
4. Verify all tests run and pass
5. Verify build completes successfully
6. Merge PR to develop
7. Create PR from develop to main
8. Verify workflow triggers again
9. Merge to main
10. Verify deployment job runs (placeholder)
11. Check all logs for clarity and completeness

**Acceptance Criteria**:
- [ ] PR to develop triggers CI workflow
- [ ] PR to main triggers CI workflow
- [ ] Push to main triggers CI workflow with deploy job
- [ ] All tests run sequentially and pass
- [ ] Build completes successfully
- [ ] Workflow status is clearly reported on PR
- [ ] Logs are clear and helpful
- [ ] Deployment placeholder executes on main merge

---

## Summary

**Total Estimated Effort**: ~8 hours

**Parallelizable Tasks**:
- Task 4.1 can be done alongside Task 4.2

**Critical Path**:
1.1 → 1.2 → 2.1 → 2.2 → 3.1 → 3.2 → 3.3 → 4.2 → 4.3

**Key Milestones**:
1. Docker infrastructure ready (after Task 1.1)
2. Test utilities support CI environment (after Task 1.2)
3. Local testing works in Docker (after Task 2.1)
4. Coverage reporting enabled (after Task 2.2)
5. Basic CI workflow functional (after Task 3.1)
6. Optimized CI with caching (after Task 3.2)
7. Complete CI/CD foundation (after Task 3.3)
8. Production ready (after Task 4.3)

