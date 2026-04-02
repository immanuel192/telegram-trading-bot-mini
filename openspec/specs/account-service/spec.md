# account-service Specification

## Purpose
The Account Service manages trading account configurations, credentials, and state. It provides centralized access to account data for order execution and monitoring, employing caching strategies to optimize performance under high-frequency load.

## Requirements
### Requirement: Account Service
The trade-manager SHALL provide an AccountService for managing trading accounts.

#### Scenario: Account service initialization
- **WHEN** creating the AccountService
- **THEN** it SHALL accept AccountRepository via constructor injection
- **AND** it SHALL be registered in the dependency injection container

#### Scenario: Get account by MongoDB ID
- **WHEN** getById is called with a MongoDB ObjectId
- **THEN** the service SHALL:
  - Query the repository with the ObjectId
  - Return the Account if found
  - Return null if not found

#### Scenario: Get account by business ID
- **WHEN** getByAccountId is called with an accountId string
- **THEN** the service SHALL:
  - Query the repository using findByAccountId
  - Return the Account if found
  - Return null if not found

#### Scenario: Get all active accounts
- **WHEN** getAllActive is called
- **THEN** the service SHALL:
  - Query the repository using findAllActive
  - Return an array of active accounts
  - Return an empty array if no active accounts exist

#### Scenario: Create new account
- **WHEN** create is called with account data
- **THEN** the service SHALL:
  - Validate required fields (accountId, isActive, telegramChannelCode, accountType)
  - Insert the account via repository
  - Return the created account with _id

#### Scenario: Update existing account
- **WHEN** update is called with accountId and update data
- **THEN** the service SHALL:
  - Find the account by accountId
  - Update the account fields
  - Return the updated account
  - Return null if account not found

#### Scenario: Set account active status
- **WHEN** setActiveStatus is called with accountId and isActive flag
- **THEN** the service SHALL:
  - Call repository.setActiveStatus
  - Return true if the account was updated
  - Return false if the account was not found

#### Scenario: Read-through Memory Cache
- **WHEN** `getAccountByIdWithCache` is called
- **THEN** the service SHALL check its internal Map cache:
  - If a valid entry exists within TTL (30s): Return documented without database query.
  - If missing or expired: Fetch from repository, update cache, and return document.

### Requirement: Account Service Error Handling
The AccountService SHALL handle errors gracefully and provide meaningful error messages.

#### Scenario: Repository error handling
- **WHEN** a repository operation fails
- **THEN** the service SHALL:
  - Log the error with relevant context
  - Capture the error in Sentry
  - Re-throw the error for caller handling

#### Scenario: Validation errors
- **WHEN** creating or updating an account with invalid data
- **THEN** the service SHALL:
  - Validate required fields
  - Throw a descriptive error for missing or invalid fields
  - NOT persist invalid data

### Requirement: Account Service Testing
The AccountService SHALL have comprehensive unit and integration tests.

#### Scenario: Unit tests with mocked repository
- **WHEN** unit testing AccountService
- **THEN** tests SHALL:
  - Mock the AccountRepository
  - Verify correct repository methods are called
  - Verify correct parameters are passed
  - Verify return values are handled correctly

#### Scenario: Integration tests with real database
- **WHEN** integration testing AccountService
- **THEN** tests SHALL:
  - Use a real MongoDB instance (Docker)
  - Create test accounts
  - Verify CRUD operations work end-to-end
  - Clean up test data after each test

#### Scenario: Container integration test
- **WHEN** testing the dependency injection container
- **THEN** the test SHALL verify:
  - AccountService is registered correctly
  - AccountService receives AccountRepository dependency
  - AccountService can be retrieved from container

