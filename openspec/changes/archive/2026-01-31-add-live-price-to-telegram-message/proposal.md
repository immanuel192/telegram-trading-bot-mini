## Why

Currently, when telegram messages are processed, we don't capture the live market price at the time of signal receipt. This makes it impossible to audit and evaluate the accuracy and quality of trading signals from different channels. By adding live price data to telegram messages, we can measure signal quality, identify high-performing channels, and make data-driven decisions about which signal sources to trust.

## What Changes

- Add optional `livePrice` field to `TelegramMessage` model for manual audit purposes
- Refactor `PriceCacheService` registration in trade-manager to be available across event handlers
- Extract live price fetching logic from `validateEntryPrice()` into separate helper method
- Update `TranslateResultHandler` to fetch and store live price when processing translation results (when symbol is known)
- Store one live price per message (first symbol encountered) using atomic MongoDB update
- Generate/update tests for new functionality

## Capabilities

### New Capabilities
- `telegram-message-live-price`: Capture and store live market price at the time of telegram message processing for signal quality auditing

### Modified Capabilities
<!-- No existing spec requirements are changing - this is purely additive functionality -->

## Impact

**Affected Code:**
- `libs/dal/src/models/telegram-message.model.ts` - Add `livePrice` field
- `libs/dal/src/repositories/telegram-message.repository.ts` - Support live price in updates
- `apps/trade-manager/src/interfaces/container.interface.ts` - Add PriceCacheService instances
- `apps/trade-manager/src/container.ts` - Register PriceCacheService for exchanges
- `apps/trade-manager/src/events/consumers/translate-result-handler.ts` - Extract live price fetching logic and store live price

**Dependencies:**
- Reuses existing `PriceCacheService` from `@telegram-trading-bot-mini/shared/utils`
- Depends on existing price streaming infrastructure (Oanda price streaming job)

**APIs:**
- No external API changes
- Internal data model change (additive, backward compatible)
