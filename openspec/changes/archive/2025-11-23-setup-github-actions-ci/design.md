# Design: GitHub Actions CI Architecture

## Overview
This design establishes a Docker-based CI pipeline using GitHub Actions that ensures code quality through automated testing and build verification. The solution leverages the existing Docker Compose infrastructure while adding CI-specific optimizations.

## Architecture Decisions

### 1. Workflow Strategy
**Decision**: Use a single workflow file with conditional steps based on branch and event type.

**Rationale**:
- Reduces duplication and maintenance overhead
- Easier to ensure consistency between PR and merge workflows
- Simpler to understand the entire CI process in one place

**Alternatives Considered**:
- Separate workflows for PR and merge: Rejected due to duplication
- Separate workflows per app: Rejected as it doesn't match the monorepo philosophy

### 2. Docker Compose Strategy
**Decision**: Use two separate Docker Compose files - one for dependencies and one for the test runner environment.

**Rationale**:
- **Local Development**: Engineers run `npm run stack:up` to spin up dependencies, then run tests directly from their machine
- **CI Environment**: Uses both Docker Compose files to create an isolated test environment
- Reuses existing `docker-compose.yml` for MongoDB, Redis, Upstash (dependencies)
- New `docker-compose.test.yml` provides test runner container with proper environment variables
- Allows volume mapping of source code into container
- Provides consistent environment between local and CI
- If it works locally with both compose files, it will work in CI

**Structure**:
```
docker-compose.yml          # Existing: MongoDB, Redis, Upstash (dependencies)
docker-compose.test.yml     # New: Test runner service with volume mapping and env vars
```

**Local vs CI Workflow**:
- **Local**: `docker-compose up -d` (dependencies only) → run tests from host machine
- **CI**: `docker-compose -f docker-compose.yml -f docker-compose.test.yml up` → run tests inside container

### 3. Test Execution Strategy
**Decision**: Run tests sequentially for libs and apps using a shell script.

**Rationale**:
- Avoids resource contention in CI environment
- Easier to debug failures (clear separation of test results)
- Simpler implementation for MVP
- Can be optimized to parallel execution later if needed
- Tests libs first to catch foundational issues early

**Sequence**:
1. Start infrastructure services (MongoDB, Redis, Upstash)
2. Wait for services to be healthy
3. Set `CI=true` environment variable
4. Run `nx test shared-utils` (libs/shared/utils)
5. Run `nx test dal` (libs/dal)
6. Run `nx test telegram-service`
7. Run `nx test interpret-service`
8. Run `nx test trade-manager`
9. Run `nx build` (all apps)

### 4. Node.js Version Management
**Decision**: Use official `node:20.19.5` Docker image in docker-compose.test.yml.

**Rationale**:
- Ensures consistency with development environment
- Avoids "works on my machine" issues
- Official images are well-maintained and secure
- No need for custom Dockerfile

### 5. Caching Strategy
**Decision**: Implement multi-layer caching:
- GitHub Actions cache for `node_modules`
- Nx cache for build artifacts

**Rationale**:
- Significantly reduces CI execution time
- `node_modules` rarely change between commits
- Nx cache speeds up builds and tests

### 6. Coverage Reporting Strategy
**Decision**: Generate and display combined coverage reports only in CI environment.

**Rationale**:
- Provides visibility into test coverage across all libs and apps
- Runs only in CI to avoid slowing down local development
- Combined report gives overall project health snapshot
- Text summary in CI logs for quick review without downloading artifacts
- Individual coverage reports preserved for detailed analysis

**Implementation**:
- Add `--coverage` flag to all test commands in CI script
- Generate coverage for: shared-utils, dal, telegram-service, interpret-service, trade-manager
- Display text summary in CI logs
- Coverage files stored in `coverage/` directory structure

## Component Design

### GitHub Actions Workflow
**File**: `.github/workflows/ci.yml`

**Triggers**:
- `pull_request` targeting `develop` or `main`
- `push` to `main` branch

**Jobs**:
1. **test-and-build**
   - Checkout code
   - Restore caches (node_modules, Nx)
   - Start dependencies via Docker Compose (docker-compose.yml)
   - Start test runner via Docker Compose (docker-compose.test.yml)
   - Run tests sequentially (libs then apps)
   - Run build
   - Save caches
   - Stop services

2. **deploy** (conditional: only on push to main)
   - Depends on: test-and-build
   - Placeholder step with comment for future deployment

### Docker Compose Test Environment
**File**: `docker-compose.test.yml`

**Services**:
- `test-runner`:
  - Image: `node:20.19.5`
  - Volume mount: `.:/app` (entire repo)
  - Working directory: `/app`
  - Network: `telegram-trading-bot` (same as other services)
  - Depends on: `mongo`, `redis`, `upstash-serverless-redis-http`
  - Environment variables:
    - `CI`: `true`
    - `NODE_ENV`: `test`
    - `MONGODB_URI`: `mongodb://mongo:27017/?replicaSet=rs0&directConnection=true`
    - `MONGODB_DBNAME`: `telegram-trading-bot-test`
    - `REDIS_URL`: `redis://redis:6379`
    - `UPSTASH_REDIS_REST_URL`: `http://upstash-serverless-redis-http:80`
    - `UPSTASH_REDIS_REST_TOKEN`: `fake-token`
  - Command: Tail (keeps container running) or test script

### Test Execution Script
**File**: `.github/scripts/run-tests.sh`

**Logic**:
```bash
#!/bin/bash
set -e

export CI=true

echo "Installing dependencies..."
npm ci

echo "Waiting for services to be ready..."
# Wait for MongoDB
until nc -z mongo 27017; do sleep 1; done
# Wait for Redis
until nc -z redis 6379; do sleep 1; done

echo "Running tests for shared-utils..."
npx nx test shared-utils --coverage

echo "Running tests for dal..."
npx nx test dal --coverage

echo "Running tests for telegram-service..."
npx nx test telegram-service --coverage

echo "Running tests for interpret-service..."
npx nx test interpret-service --coverage

echo "Running tests for trade-manager..."
npx nx test trade-manager --coverage

echo "Building all apps..."
npx nx build telegram-service
npx nx build interpret-service
npx nx build trade-manager

echo ""
echo "Coverage Summary:"
echo "================="
# Display coverage summary for each project
find coverage -name "lcov-report/index.html" -o -name "coverage-summary.json" | head -10

echo "All tests and builds completed successfully!"
```

## Data Flow

### PR Workflow
```
PR Created/Updated
  ↓
Trigger: pull_request (develop/main)
  ↓
Checkout Code
  ↓
Restore Cache (node_modules, Nx)
  ↓
Start Dependencies (docker-compose.yml)
  ↓
Start Test Runner (docker-compose.test.yml with env vars)
  ↓
Install Dependencies (npm ci inside container)
  ↓
Run Tests (shared-utils → dal → telegram-service → interpret-service → trade-manager)
  ↓
Run Build (all apps)
  ↓
Save Cache
  ↓
Stop Services
  ↓
Report Status (✓ or ✗)
```

### Main Branch Merge Workflow
```
Push to main
  ↓
Trigger: push (main)
  ↓
[Same as PR workflow through Build]
  ↓
Deploy Job (placeholder)
  ↓
Report Status (✓ or ✗)
```

## Error Handling
- Each test command uses `set -e` to fail fast
- Docker Compose health checks ensure services are ready
- Workflow fails if any test or build fails
- Clear error messages in logs for debugging

## Performance Considerations
- **Caching**: Reduces workflow time from ~10min to ~3-5min (estimated)
- **Sequential Tests**: ~6-9min total with coverage (estimated 1.5-2min per lib/app)
- **Coverage Overhead**: Adds ~20-30% to test execution time
- **Build**: ~2-3min (estimated)
- **Total**: ~12-18min for first run, ~7-11min with cache

## Security Considerations
- No secrets required for testing (uses local Docker services)
- Future deployment will use GitHub Secrets for credentials
- Docker images use official Node.js base (regularly updated)
- No external network access required during tests

## Future Enhancements
- Parallel test execution using matrix strategy
- Code coverage reporting and upload to Codecov
- Automated semantic versioning
- Deploy to staging/production environments
- Slack/Discord notifications on failure
- Performance benchmarking
