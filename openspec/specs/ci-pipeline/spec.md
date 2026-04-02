# ci-pipeline Specification

## Purpose
TBD - created by archiving change setup-github-actions-ci. Update Purpose after archive.
## Requirements
### Requirement: Automated Testing on Pull Requests
The system SHALL automatically run all tests when a pull request is created or updated targeting the `develop` or `main` branches.

#### Scenario: Pull request to develop branch triggers CI
**Given** a developer creates a pull request targeting the `develop` branch  
**When** the pull request is created or updated with new commits  
**Then** the CI workflow SHALL be triggered automatically  
**And** all app tests SHALL run sequentially (telegram-service, interpret-service, trade-manager)  
**And** the build process SHALL execute for all apps  
**And** the PR status SHALL reflect the test and build results (pass/fail)

#### Scenario: Pull request to main branch triggers CI
**Given** a developer creates a pull request targeting the `main` branch  
**When** the pull request is created or updated with new commits  
**Then** the CI workflow SHALL be triggered automatically  
**And** all app tests SHALL run sequentially (telegram-service, interpret-service, trade-manager)  
**And** the build process SHALL execute for all apps  
**And** the PR status SHALL reflect the test and build results (pass/fail)

#### Scenario: Failed tests prevent merge
**Given** a pull request has been created  
**When** any test fails during the CI workflow  
**Then** the workflow status SHALL be marked as failed  
**And** the PR SHALL display the failure status  
**And** developers SHALL be able to view detailed logs of the failed tests

---

### Requirement: Automated Build Verification
The system SHALL verify that all applications build successfully before allowing code to be merged.

#### Scenario: Successful build verification
**Given** all tests have passed in the CI workflow  
**When** the build step executes  
**Then** all apps (telegram-service, interpret-service, trade-manager) SHALL build without errors  
**And** the build artifacts SHALL be created successfully  
**And** the workflow status SHALL be marked as passed

#### Scenario: Build failure detection
**Given** tests have passed in the CI workflow  
**When** the build step executes  
**And** any app fails to build  
**Then** the workflow status SHALL be marked as failed  
**And** the build error logs SHALL be available for review  
**And** the PR SHALL display the failure status

---

### Requirement: Consistent CI Environment
The CI environment SHALL use Docker Compose to ensure consistency with local development and provide all required dependencies.

#### Scenario: CI environment setup
**Given** a CI workflow is triggered  
**When** the environment setup step executes  
**Then** MongoDB SHALL be started via Docker Compose  
**And** Redis SHALL be started via Docker Compose  
**And** Upstash Redis HTTP SHALL be started via Docker Compose  
**And** all services SHALL be healthy before tests run  
**And** the test runner SHALL use Node.js v20.19.5

#### Scenario: Service health verification
**Given** Docker Compose services are starting  
**When** the test runner attempts to connect  
**Then** the workflow SHALL wait for MongoDB to be ready  
**And** the workflow SHALL wait for Redis to be ready  
**And** tests SHALL only start after all services are healthy

#### Scenario: Volume mapping for source code
**Given** the CI Docker environment is set up  
**When** the test runner container starts  
**Then** the repository source code SHALL be mounted as a volume  
**And** changes to the code SHALL be immediately available in the container  
**And** test execution SHALL use the mounted source code

---

### Requirement: Deployment Pipeline Foundation
The system SHALL include a placeholder for deployment steps when code is merged to the `main` branch.

#### Scenario: Merge to main triggers deployment job
**Given** a pull request is merged to the `main` branch  
**When** the CI workflow completes successfully  
**Then** a deployment job SHALL be triggered  
**And** the deployment job SHALL depend on the test-and-build job  
**And** the deployment job SHALL contain a placeholder step with documentation

#### Scenario: Deployment placeholder documentation
**Given** the deployment job is defined  
**When** a developer views the workflow file  
**Then** the placeholder step SHALL include a comment explaining future deployment logic  
**And** the placeholder SHALL not execute any actual deployment actions  
**And** the workflow SHALL complete successfully with the placeholder

---

### Requirement: Sequential Test Execution
The system SHALL execute tests for each application sequentially to avoid resource conflicts and ensure clear failure attribution.

#### Scenario: Sequential test execution order
**Given** the CI workflow test step is executing  
**When** tests begin  
**Then** telegram-service tests SHALL run first  
**And** interpret-service tests SHALL run after telegram-service completes  
**And** trade-manager tests SHALL run after interpret-service completes  
**And** each app's test results SHALL be clearly separated in logs

#### Scenario: Early failure detection
**Given** tests are running sequentially  
**When** telegram-service tests fail  
**Then** the workflow SHALL stop immediately  
**And** interpret-service and trade-manager tests SHALL not execute  
**And** the failure SHALL be clearly reported with telegram-service context

---

### Requirement: Caching for Performance
The system SHALL implement caching strategies to reduce CI execution time.

#### Scenario: Node modules caching
**Given** a CI workflow is triggered  
**When** the setup step executes  
**Then** the workflow SHALL attempt to restore cached node_modules  
**And** if cache exists, npm install SHALL be skipped  
**And** after successful workflow, node_modules SHALL be cached for future runs

#### Scenario: Nx cache utilization
**Given** Nx tasks are executing  
**When** a task has been run before with the same inputs  
**Then** Nx SHALL use cached results  
**And** the task SHALL complete faster than the first run  
**And** the cache SHALL be persisted across workflow runs

#### Scenario: Docker layer caching
**Given** the CI Docker image is being built  
**When** the Dockerfile.ci has not changed  
**Then** Docker SHALL reuse cached layers  
**And** only changed layers SHALL be rebuilt  
**And** the image build time SHALL be reduced

---

### Requirement: Clear Workflow Status Reporting
The system SHALL provide clear, actionable feedback on workflow status and failures.

#### Scenario: Successful workflow status
**Given** all tests and builds pass  
**When** the workflow completes  
**Then** the PR SHALL display a green checkmark  
**And** the status message SHALL indicate "All checks passed"  
**And** developers SHALL be able to merge the PR

#### Scenario: Failed workflow status
**Given** any test or build fails  
**When** the workflow completes  
**Then** the PR SHALL display a red X  
**And** the status message SHALL indicate which step failed  
**And** developers SHALL be able to click through to detailed logs  
**And** the PR SHALL be blocked from merging (if branch protection is enabled)

#### Scenario: Workflow execution logs
**Given** a workflow has run  
**When** a developer views the workflow details  
**Then** logs SHALL be organized by job and step  
**And** each app's test output SHALL be clearly separated  
**And** error messages SHALL be highlighted and easy to find  
**And** timestamps SHALL be included for each step

---

