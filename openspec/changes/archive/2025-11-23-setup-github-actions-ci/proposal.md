# Proposal: Setup GitHub Actions CI

## Context
The project currently lacks automated CI/CD pipelines. Manual testing and building increases the risk of integration issues and slows down the development workflow. This proposal introduces GitHub Actions workflows to automate testing and building on pull requests and merges to main branches.

## Problem Statement
- No automated testing on pull requests, leading to potential integration issues
- No automated build verification before merging code
- Developers must manually run tests locally, which can be skipped or forgotten
- No consistent CI environment across different developer machines
- No automated deployment pipeline (placeholder needed for future work)

## Proposed Solution
Implement GitHub Actions workflows that:
1. **On PR to `develop` or `main`**: Run setup, tests for all apps sequentially, and build verification
2. **On merge to `main`**: Run setup, tests, build, and include a deployment placeholder
3. Use Docker Compose with the existing `docker-compose.yml` and a new CI-specific Dockerfile
4. Use Node.js v20.19.5 for consistency
5. Run tests for each app (`telegram-service`, `interpret-service`, `trade-manager`) sequentially to avoid resource conflicts

## Goals
- Ensure all PRs are tested before merge
- Catch integration issues early in the development cycle
- Provide consistent CI environment using Docker
- Establish foundation for automated deployment
- Maintain test isolation and reliability

## Non-Goals
- Implementing actual deployment logic (placeholder only)
- Setting up CD for staging/production environments
- Implementing parallel test execution (sequential for MVP)
- Setting up code coverage reporting
- Implementing performance benchmarks

## Success Criteria
- GitHub Actions workflows trigger on PR creation/updates to `develop` and `main`
- All app tests run successfully in CI environment
- Build process completes without errors
- Workflow uses Docker Compose with volume mapping for code
- Deployment placeholder is present in main branch workflow
- CI uses Node.js v20.19.5

## Dependencies
- Existing `docker-compose.yml` for MongoDB, Redis, and Upstash Redis HTTP
- Nx monorepo structure with apps: `telegram-service`, `interpret-service`, `trade-manager`
- Jest test framework already configured
- Node.js v20.19.5

## Risks & Mitigations
- **Risk**: Sequential test execution may be slow
  - **Mitigation**: Start with sequential, optimize to parallel in future if needed
- **Risk**: Docker Compose in CI may have resource constraints
  - **Mitigation**: Use GitHub Actions' standard runners which have sufficient resources
- **Risk**: Tests may be flaky in CI environment
  - **Mitigation**: Use proper wait strategies and health checks for services

## Open Questions
1. Should we add caching for `node_modules` to speed up CI? (Recommend: Yes, using actions/cache)
2. Should we add a timeout for the entire workflow? (Recommend: 30 minutes)
3. Should we require CI to pass before allowing merge? (Recommend: Yes, via branch protection rules)
4. Do we need separate workflows for `develop` and `main`, or can we use one with conditional steps? (Recommend: Single workflow with conditions for simplicity)
