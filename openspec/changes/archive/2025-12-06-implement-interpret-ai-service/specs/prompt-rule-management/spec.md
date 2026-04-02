## ADDED Requirements

### Requirement: Prompt Rule Storage
The system SHALL provide a data model to store custom AI prompts for message translation.

#### Scenario: Create prompt rule with classification and extraction prompts
- **WHEN** a new prompt rule is created with promptId, name, classificationPrompt, and extractionPrompt
- **THEN** the prompt rule is stored in the database with createdAt and updatedAt timestamps

#### Scenario: Retrieve prompt rule by promptId
- **WHEN** a prompt rule is queried by its promptId
- **THEN** the system returns the complete prompt rule including both prompts

#### Scenario: List all prompt rules
- **WHEN** all prompt rules are requested
- **THEN** the system returns an array of all prompt rules ordered by createdAt descending

### Requirement: Prompt Rule Validation
The system SHALL validate prompt rule content before storage.

#### Scenario: Reject empty prompts
- **WHEN** a prompt rule is created with empty classificationPrompt or extractionPrompt
- **THEN** the system rejects the creation with a validation error

#### Scenario: Enforce unique promptId
- **WHEN** a prompt rule is created with a promptId that already exists
- **THEN** the system rejects the creation with a duplicate key error

### Requirement: Prompt Rule Repository
The system SHALL provide repository methods for prompt rule CRUD operations.

#### Scenario: Find prompt by promptId
- **WHEN** findByPromptId is called with a valid promptId
- **THEN** the system returns the matching PromptRule or null if not found

#### Scenario: Create new prompt rule
- **WHEN** a new PromptRule is inserted via repository
- **THEN** the system assigns createdAt and updatedAt timestamps and returns the created document

#### Scenario: Update existing prompt rule
- **WHEN** an existing PromptRule is updated via repository
- **THEN** the system updates the updatedAt timestamp and persists changes
