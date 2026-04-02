
Notes from the migration:
1. Open order flow
- For now we assume we always able to fetch price from Oanda and use it for live price
- The flow of trigger background job to update stop loss because we force stoploss for new order is not correct anymore since we are able to calculate stop loss based on live price before open. It has been removed from the flow.
- 
2. Close order flow
3. Cancel order flow
4. Move SL flow
5. Set TP/SL flow
