Query Mongodb


By Account - Sum PNL grouped by account:

```js
db.orders.aggregate([
  {
    $match: {
      status: "closed",
      "pnl.pnl": { $exists: true },
      closedAt: {
        $gte: ISODate("2026-01-01T00:00:00Z"),
        $lt: ISODate("2026-02-01T00:00:00Z")
      }
    }
  },
  {
    $group: {
      _id: "$accountId",
      totalPnl: { $sum: "$pnl.pnl" },
      orderCount: { $sum: 1 },
      avgPnl: { $avg: "$pnl.pnl" },
      maxPnl: { $max: "$pnl.pnl" },
      minPnl: { $min: "$pnl.pnl" },
      winCount: {
        $sum: {
          $cond: [{ $gt: ["$pnl.pnl", 0] }, 1, 0]
        }
      },
      lossCount: {
        $sum: {
          $cond: [{ $lt: ["$pnl.pnl", 0] }, 1, 0]
        }
      }
    }
  },
  {
    $sort: { totalPnl: -1 }
  }
])
```

By Symbol - Sum PNL grouped by symbol:

```js
db.orders.aggregate([
  {
    $match: {
      status: "closed",
      "pnl.pnl": { $exists: true }
    }
  },
  {
    $group: {
      _id: "$symbol",
      totalPnl: { $sum: "$pnl.pnl" },
      orderCount: { $sum: 1 },
      avgPnl: { $avg: "$pnl.pnl" },
      winCount: {
        $sum: {
          $cond: [{ $gt: ["$pnl.pnl", 0] }, 1, 0]
        }
      },
      lossCount: {
        $sum: {
          $cond: [{ $lt: ["$pnl.pnl", 0] }, 1, 0]
        }
      }
    }
  },
  {
    $sort: { totalPnl: -1 }
  }
])
```

Query to JOIN and cross check orders

db.getCollection("orders").aggregate([
  // Step 1: Filter orders by accountId
  {
    $match: {
        "accountId" : "gold_super_vip",
    }
  },
  
  // Step 2: Lookup (JOIN) with telegram_messages collection
  // Using messageId and channelId as the composite key
  {
    $lookup: {
     from: "telegram-messages",
      let: { 
        orderMsgId: "$messageId", 
        orderChId: "$channelId" 
      },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                { $eq: ["$messageId", "$$orderMsgId"] },
                { $eq: ["$channelId", "$$orderChId"] }
              ]
            }
          }
        },
        // Project only the fields we need from telegram message
        {
          $project: {
            message: 1,
            originalMessage: 1,
            quotedMessage: 1,
            prevMessage: 1,
            history: 1,
            sentAt: 1,
            channelCode: 1
          }
        }
      ],
      as: "telegramMessage"
    }
  },
  
  // Step 3: Unwind the lookup result (1 order -> 1 message)
  {
    $unwind: {
      path: "$telegramMessage",
      preserveNullAndEmptyArrays: true // Keep orders even if no matching message
    }
  },
  
  // Step 4: Project the final output with desired fields
  {
    $project: {
      orderId: 1,
      accountId: 1,
      symbol: 1,
      side: 1,
      status: 1,
      lotSize: 1,
      executionType: 1,
      messageId: 1,
      channelId: 1,
      createdAt: 1,
      "entry.entryPrice": 1,
      "entry.actualEntryPrice": 1,
      "sl.slPrice": 1,
      "tp.tp1Price": 1,
      // Telegram message fields
      "telegramMessage.message": 1,
      "telegramMessage.originalMessage": 1,
      "telegramMessage.quotedMessage": 1,
      "telegramMessage.prevMessage": 1,
      "telegramMessage.history": 1,
      "telegramMessage.sentAt": 1,
      // Order history for comparison
      history: 1
    }
  },
  
  // Step 5: Sort by createdAt descending (newest first)
  {
    $sort: { createdAt: -1 }
  }
]);
