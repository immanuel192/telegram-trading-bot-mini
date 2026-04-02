# GitHub Actions CI/CD

This directory contains the GitHub Actions workflow configurations for the Telegram Auto Trading Bot.

## Workflows

### CI (`ci.yml`)

This is the main workflow that runs on every push to `main` and every Pull Request to `main` or `develop`.

#### Jobs

1. **Test and Build (`test-and-build`)**
   - **Environment**: `ubuntu-latest`
   - **Timeout**: 30 minutes
   - **Steps**:
     - Checkout code
     - Cache `node_modules` and Nx cache
     - Start Docker services (`mongo`, `redis`, `upstash-serverless-redis-http`)
     - Start `test-runner` container (Node.js environment)
     - Run tests inside `test-runner` using `.github/scripts/run-tests.sh`
     - Stop services

2. **Deploy (`deploy`)**
   - **Depends on**: `test-and-build`
   - **Condition**: Only runs on push to `main`
   - **Action**: Currently a placeholder for future deployment logic.

## Caching Strategy

The workflow uses `actions/cache@v4` to speed up execution:

- **node_modules**: Caches `node_modules` based on `package-lock.json` hash.
- **Nx Cache**: Caches `.nx/cache` based on `package-lock.json` and commit SHA.

## Environment Variables

The CI environment is configured via `docker-compose.test.yml`. Key variables include:

- `CI=true`: Signals the application to use CI-specific configurations (e.g., test database URIs).
- `NODE_ENV=test`: Sets the Node.js environment.
- `MONGODB_URI`: Points to the `mongo` service container.
- `REDIS_URL`: Points to the `upstash-serverless-redis-http` service container.

## Local Testing

You can simulate the CI environment locally using Docker Compose. This ensures that if tests pass locally, they will pass in CI.

1. **Start the stack**:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.test.yml up -d
   ```

2. **Run tests**:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.test.yml exec test-runner /app/.github/scripts/run-tests.sh
   ```

3. **Stop the stack**:
   ```bash
   docker compose -f docker-compose.yml -f docker-compose.test.yml down
   ```

## Troubleshooting

- **Tests fail in CI but pass locally**: Ensure you are running local tests inside the Docker container as shown above. Local host environment might differ (e.g., Node version, OS).
- **Service connection errors**: Check `docker-compose.test.yml` network configuration. All services must be on the same network (`telegram-trading-bot`).
- **Coverage missing**: Ensure `jest.preset.js` includes `json` reporter so that `nyc` can merge reports.
