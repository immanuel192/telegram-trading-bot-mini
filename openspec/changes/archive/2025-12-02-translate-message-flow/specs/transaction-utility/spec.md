# transaction-utility Spec Delta

## ADDED Requirements

### Requirement: MongoDB Transaction Utility
The DAL library SHALL provide a reusable utility for executing operations within MongoDB transactions.

#### Scenario: Transaction execution
- **WHEN** calling `withMongoTransaction` with an async operation
- **THEN** it SHALL:
  - Create a new MongoDB client session
  - Start a transaction on the session
  - Execute the provided operation with the session
  - Commit the transaction if operation succeeds
  - Abort the transaction if operation throws an error
  - End the session in all cases
  - Return the operation result on success
  - Re-throw the error on failure

#### Scenario: Session propagation
- **WHEN** an operation is executed within a transaction
- **THEN** the MongoDB session SHALL be passed to the operation callback
- **AND** the operation SHALL use this session for all database operations
- **AND** all operations SHALL be part of the same transaction

#### Scenario: Error handling
- **WHEN** an operation throws an error within a transaction
- **THEN** the transaction SHALL be automatically aborted
- **AND** the session SHALL be ended
- **AND** the original error SHALL be re-thrown to the caller
- **AND** no partial changes SHALL be persisted to the database

#### Scenario: Transaction isolation
- **WHEN** multiple transactions run concurrently on the same document
- **THEN** MongoDB SHALL serialize the transactions
- **AND** each transaction SHALL see a consistent snapshot
- **AND** the last committed transaction SHALL win

#### Scenario: API signature
- **WHEN** using the transaction utility
- **THEN** it SHALL export a function `withMongoTransaction<T>`
- **AND** the function SHALL accept a callback `(session: ClientSession) => Promise<T>`
- **AND** the function SHALL return `Promise<T>`
- **AND** the generic type `T` SHALL be the operation result type
