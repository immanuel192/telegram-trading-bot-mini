## 1. Data Model Changes

- [x] 1.1 Add `livePrice?: number` field to meta object in TelegramMessage interface in `libs/dal/src/models/telegram-message.model.ts` with JSDoc documentation

## 2. Container and Dependency Injection Setup

- [x] 2.1 Add `priceCacheServices` property to Container interface in `apps/trade-manager/src/interfaces/container.interface.ts`
- [x] 2.2 Register PriceCacheService instances for 'oanda' and 'mock' exchanges in `apps/trade-manager/src/container.ts`

## 3. TranslateResultHandler - Extract Live Price Fetching Logic

- [x] 3.1 Add private helper method `fetchLivePrice(symbol: string): Promise<number | null>` to TranslateResultHandler
- [x] 3.2 Implement fetchLivePrice() to use PriceCacheService.getPriceFromAnyExchange() with 30s TTL
- [x] 3.3 Implement fetchLivePrice() to calculate and return mid-price `(bid + ask) / 2`
- [x] 3.4 Implement fetchLivePrice() to return null gracefully when price unavailable
- [x] 3.5 Refactor `validateEntryPrice()` to call `fetchLivePrice()` instead of inline price fetching
- [x] 3.6 Verify validateEntryPrice() maintains existing threshold validation behavior

## 4. TranslateResultHandler - Capture Live Price

- [x] 4.1 Add helper method `shouldCaptureLivePrice(message: TelegramMessage): boolean` to check if livePrice already exists
- [x] 4.2 Update `processCommand()` to fetch live price after processing first command with symbol
- [x] 4.3 Add logic to skip live price capture if message already has livePrice
- [x] 4.4 Add logic to skip live price capture if command has no symbol in extraction
- [x] 4.5 Call `fetchLivePrice(command.extraction.symbol)` to get live price
- [x] 4.6 Update TelegramMessage document with atomic $set operation for livePrice
- [x] 4.7 Add error handling and logging for live price fetch failures

## 5. Repository Updates

- [x] 5.1 Add method `updateLivePrice(channelId: string, messageId: number, livePrice: number): Promise<boolean>` to TelegramMessageRepository (Sets `meta.livePrice` using dot notation)
- [x] 5.2 Implement updateLivePrice() using atomic $set operation
- [x] 5.3 Add optional session parameter support for transaction compatibility

## 6. Unit Tests - TranslateResultHandler (fetchLivePrice)

- [x] 6.1 Add test: "fetchLivePrice should return mid-price when cached price exists" (Refactored to getPriceCacheFromAnyExchange)
- [x] 6.2 Add test: "fetchLivePrice should return null when no cached price exists" (Refactored to getPriceCacheFromAnyExchange)
- [x] 6.3 Add test: "fetchLivePrice should calculate mid-price correctly from bid/ask" (Refactored)
- [x] 6.4 Add test: "fetchLivePrice should use 30 second TTL for price cache" (Refactored)
- [x] 6.5 Add test: "fetchLivePrice should handle Redis errors gracefully" (Refactored)

## 7. Unit Tests - TranslateResultHandler (validateEntryPrice refactoring)

- [x] 7.1 Add test: "validateEntryPrice should call fetchLivePrice helper"
- [x] 7.2 Add test: "validateEntryPrice should apply threshold validation after fetching price"
- [x] 7.3 Verify all existing validateEntryPrice tests still pass

## 8. Unit Tests - TranslateResultHandler (live price capture)

- [x] 8.1 Add test: "processCommand should capture live price for first symbol"
- [x] 8.2 Add test: "processCommand should skip live price when already set"
- [x] 8.3 Add test: "processCommand should skip live price when command has no symbol"
- [x] 8.4 Add test: "processCommand should continue processing when live price fetch fails"
- [x] 8.5 Add test: "processCommand should use atomic $set for livePrice update"
- [x] 8.6 Add test: "processCommand should log warning when price unavailable"

## 9. Unit Tests - TelegramMessageRepository

- [x] 9.1 Add test: "updateLivePrice should update message with atomic $set operation"
- [x] 9.2 Add test: "updateLivePrice should return true when message updated"
- [x] 9.3 Add test: "updateLivePrice should return false when message not found"
- [x] 9.4 Add test: "updateLivePrice should support optional session parameter"

## 10. Integration Tests

- [x] 10.1 Add integration test: "TranslateResultHandler should store live price in database for first symbol"
- [x] 10.2 Add integration test: "Live price should not be overwritten when processing multiple commands"
- [x] 10.3 Add integration test: "Messages without live price should remain valid (backward compatibility)"
- [x] 10.4 Add integration test: "Live price capture should not block message processing on failure"
- [x] 10.5 Update existing TranslateResultHandler integration tests to handle optional livePrice field

## 11. Documentation and Cleanup

- [x] 11.1 Update TranslateResultHandler file header comment to mention live price capture
- [x] 11.2 Add JSDoc comments for fetchLivePrice() helper method
- [x] 11.3 Add JSDoc comments for shouldCaptureLivePrice() helper method
- [x] 11.4 Add inline comments explaining live price capture logic in processCommand()
- [x] 11.5 Verify all tests pass: `npm run test:unit trade-manager`
- [x] 11.6 Verify all tests pass: `npm run test:integration trade-manager`
