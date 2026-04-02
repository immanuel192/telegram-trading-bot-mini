## ADDED Requirements

### Requirement: TelegramMessage model SHALL include optional meta.livePrice field

The `TelegramMessage` model SHALL include an optional `livePrice` field within the `meta` object of type `number` to store the live market price at the time of message processing. This field is populated by trade-manager for manual audit and signal quality evaluation purposes only.

#### Scenario: livePrice field is documented with JSDoc
- **WHEN** viewing the TelegramMessage model definition
- **THEN** the `livePrice` field SHALL have JSDoc documentation explaining:
  - It is populated by trade-manager
  - It represents live price fetched from Oanda (or any available exchange)
  - It is for human manual audit only
  - It is typically used when auditing and evaluating channel signal quality

#### Scenario: livePrice is optional and backward compatible
- **WHEN** existing telegram messages are queried
- **THEN** messages without `meta.livePrice` SHALL be valid
- **AND** the field SHALL be marked as optional (`meta.livePrice?: number`)

### Requirement: TranslateResultHandler SHALL capture live price when processing translation results

The `TranslateResultHandler` SHALL attempt to fetch and store the live market price when processing TRANSLATE_MESSAGE_RESULT events. The price SHALL be fetched using a new `fetchLivePrice()` helper method and stored in the TelegramMessage document. Only one livePrice SHALL be stored per message (first symbol encountered).

#### Scenario: Live price captured successfully for first symbol
- **WHEN** TranslateResultHandler processes a translation result with a valid symbol
- **AND** the message does not already have a livePrice
- **AND** a cached price exists for that symbol (from any exchange)
- **THEN** the handler SHALL fetch the live price using fetchLivePrice() helper
- **AND** the handler SHALL calculate mid-price as `(bid + ask) / 2`
- **AND** the handler SHALL store the mid-price in the `meta.livePrice` field using atomic $set operation with dot notation

#### Scenario: Live price skipped when already set
- **WHEN** TranslateResultHandler processes a translation result
- **AND** the message already has a livePrice value
- **THEN** the handler SHALL skip live price fetching
- **AND** the handler SHALL continue normal processing

#### Scenario: Live price not available
- **WHEN** TranslateResultHandler processes a translation result
- **AND** no cached price is available for the symbol
- **THEN** the handler SHALL log a warning
- **AND** the handler SHALL continue processing without blocking
- **AND** the `livePrice` field SHALL remain undefined

#### Scenario: Command has no symbol
- **WHEN** TranslateResultHandler processes a command without a symbol in extraction
- **THEN** the handler SHALL skip live price lookup
- **AND** the handler SHALL continue normal processing
- **AND** the `livePrice` field SHALL remain undefined

### Requirement: TranslateResultHandler SHALL extract live price fetching into helper method

The `TranslateResultHandler` SHALL have a separate `fetchLivePrice()` helper method that fetches raw live price without threshold validation. The existing `validateEntryPrice()` method SHALL be refactored to use this helper and then apply threshold validation logic.

#### Scenario: fetchLivePrice returns mid-price for valid symbol
- **WHEN** fetchLivePrice() is called with a valid symbol
- **AND** a cached price exists (within 30 seconds TTL)
- **THEN** the method SHALL fetch price using PriceCacheService.getPriceFromAnyExchange()
- **AND** the method SHALL return mid-price calculated as `(bid + ask) / 2`

#### Scenario: fetchLivePrice returns null when price unavailable
- **WHEN** fetchLivePrice() is called with a symbol
- **AND** no cached price exists
- **THEN** the method SHALL return null
- **AND** the method SHALL NOT throw an error

#### Scenario: validateEntryPrice uses fetchLivePrice helper
- **WHEN** validateEntryPrice() is called
- **THEN** it SHALL call fetchLivePrice() to get the current market price
- **AND** it SHALL apply threshold validation logic to the fetched price
- **AND** it SHALL maintain existing behavior for entry price validation

### Requirement: PriceCacheService SHALL be container-managed and injectable

The `PriceCacheService` instances SHALL be registered in the trade-manager container per exchange and injected into handlers via constructor dependency injection.

#### Scenario: PriceCacheService registered for each exchange
- **WHEN** trade-manager container is initialized
- **THEN** a PriceCacheService instance SHALL be created for 'oanda' exchange
- **AND** a PriceCacheService instance SHALL be created for 'mock' exchange
- **AND** instances SHALL be stored in container under `priceCacheServices` property

#### Scenario: TranslateResultHandler can access PriceCacheService instances
- **WHEN** TranslateResultHandler needs to fetch live price
- **THEN** it SHALL have access to priceCacheServices from container
- **AND** it SHALL use PriceCacheService('', redis) for getPriceFromAnyExchange() calls

### Requirement: Live price updates SHALL use atomic MongoDB operations

When updating telegram messages with live price data, the system SHALL use MongoDB atomic operations ($set, $push) to ensure data consistency.

#### Scenario: Live price stored with atomic $set operation
- **WHEN** NewMessageHandler updates a message with live price
- **THEN** the update SHALL use MongoDB $set operator
- **AND** the update SHALL be part of the same transaction as history entry addition

#### Scenario: History entry includes live price context
- **WHEN** addHistoryEntry is called with live price information
- **THEN** the live price MAY be included in the history entry notes for context
- **AND** the primary livePrice field SHALL be updated separately at message level

### Requirement: System SHALL maintain backward compatibility

The addition of `livePrice` field SHALL not break existing functionality or require data migration.

#### Scenario: Existing messages without livePrice remain valid
- **WHEN** querying existing telegram messages
- **THEN** messages without `livePrice` field SHALL be returned successfully
- **AND** no validation errors SHALL occur

#### Scenario: New messages can be created without livePrice
- **WHEN** creating a new telegram message
- **AND** livePrice is not provided
- **THEN** the message SHALL be created successfully
- **AND** the livePrice field SHALL be undefined
