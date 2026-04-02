# Adapter Verifier

Interactive CLI tool for testing `OrderExecutorService` in isolation with real broker adapters.

## Purpose

Test order execution logic without running the full application:
- **Adapter Development**: Test broker adapters in isolation
- **Debugging**: Verify order execution flow and database state
- **Integration Testing**: Validate against real broker APIs (sandbox)

## Quick Start

### 1. Update `seed-account.json`

Edit with your broker credentials:

```json
{
  "accountId": "test-oanda-account",
  "brokerConfig": {
    "exchangeCode": "oanda",
    "apiKey": "YOUR_API_KEY",
    "accountId": "YOUR_ACCOUNT_ID",
    "isSandbox": true,
    "serverUrl": "https://api-fxpractice.oanda.com"
  }
}
```

### 2. Update Test Cases

Edit `test-cases.ts` to match current market conditions:

- **Symbol**: Update `BASE_SYMBOL` if needed (default: `XAU_USD`)
- **Entry Prices**: Update SL/TP prices in test cases 1-2 to match current market
- **Lot Sizes**: Adjust if needed (default: 1 for OANDA)

Example:
```typescript
// Test Case 1
stopLoss: { price: 2600 },  // Update to current market - X pips
takeProfits: [{ price: 5000 }],  // Update to current market + X pips
```

### 3. Run the Script

```bash
npx nx adapter-verifier executor-service
```

## Test Cases

All test cases use **real orders** from the exchange (no fake seed data):

| #   | Name                | Description                 | Prerequisite |
| --- | ------------------- | --------------------------- | ------------ |
| 1   | LONG - Market Order | Open LONG with SL/TP        | None         |
| 2   | SHORT - Limit Order | Open SHORT limit with SL/TP | None         |
| 3   | MOVE_SL             | Move stop loss              | Test 1       |
| 4   | SET_TP_SL           | Update both TP and SL       | Test 1       |
| 5   | CLOSE_ALL           | Close all positions         | Test 1       |
| 6   | CLOSE_BAD_POSITION  | Close specific position     | Test 1       |
| 7   | CANCEL              | Cancel pending limit order  | Test 2       |

**Note**: Tests with prerequisites automatically run the required test first.

## Output

Each test shows:
1. ✅ Execution status
2. 🔍 Database verification results
3. 📋 Full order state (JSON)

Example:
```
✅ Status: open
✅ History count: 2
✅ Field entry.entryOrderId: "756"
✅ Field sl.slOrderId: "758"
✅ Field tp.tp1OrderId: "757"
✅ All verifications passed!
```

## Important Notes

- **Database**: Cleaned before each run, **NOT** cleaned after (for inspection)
- **Prerequisites**: Tests 3-6 depend on test 1, test 7 depends on test 2
- **Market Prices**: Update SL/TP prices to match current market conditions
- **Sandbox**: Always use `isSandbox: true` for testing
- **Symbol Format**: Use broker's format (e.g., `XAU_USD` for OANDA)

## Troubleshooting

| Issue                           | Solution                                            |
| ------------------------------- | --------------------------------------------------- |
| "seed-account.json not found"   | Create file with broker credentials                 |
| "Failed to connect to MongoDB"  | Start MongoDB: `docker run -d -p 27017:27017 mongo` |
| "Adapter initialization failed" | Verify API key and account ID in seed-account.json  |
| Order execution fails           | Update entry/SL/TP prices to match current market   |
