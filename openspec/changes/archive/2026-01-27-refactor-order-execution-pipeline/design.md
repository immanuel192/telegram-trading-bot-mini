# Design: Command Pipeline Pattern

## 1. Core Pattern: Action Pipeline

We will implement a middleware-style pipeline similar to Koa or Express.

### `BasePipeline` (Shared Utility)
Location: `libs/shared/src/utils/pipeline/`

```typescript
export interface IPipelineStep<TContext> {
  name: string;
  execute(ctx: TContext, next: () => Promise<void>): Promise<void>;
}

export class ActionPipeline<TContext> {
  private steps: IPipelineStep<TContext>[] = [];
  private deferredSteps: IPipelineStep<TContext>[] = [];

  use(step: IPipelineStep<TContext>): this {
    this.steps.push(step);
    return this;
  }

  // Defer steps to run at the absolute end (User Requirement)
  useDeferred(step: IPipelineStep<TContext>): this {
    this.deferredSteps.push(step);
    return this;
  }

  async run(ctx: TContext): Promise<void> {
    let index = -1;

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) throw new Error('next() called multiple times');
      index = i;
      const step = this.steps[i];
      if (step) {
        await step.execute(ctx, () => dispatch(i + 1));
      }
    };

    try {
      await dispatch(0);
    } finally {
      // Execute deferred steps in sequence
      for (const step of this.deferredSteps) {
        await step.execute(ctx, async () => {}); // Deferred steps don't have 'next'
      }
    }
  }
}
```

## 2. Execution Context (Executor Service)
Location: `apps/executor-service/src/services/order-handlers/execution-context.ts`

This object is created fresh for every order execution request.

```typescript
export class ExecutionContext {
  // Read-only Inputs
  public readonly payload: ExecuteOrderRequestPayload;
  public readonly account: Account;
  public readonly adapter: IBrokerAdapter;
  public readonly logger: LoggerInstance;

  // Mutable State (The Data Bag)
  public state: {
    entryPrice?: number;
    lotSize?: number;
    leverage?: number;
    sl?: { price?: number; pips?: number };
    tp?: { price?: number; pips?: number }[];
    brokerAdjustment?: any;
    executionResult?: any;
    isAborted: boolean;
    abortReason?: string;
    error?: Error;
    additionalHistory: any[];
  } = {
    isAborted: false,
    additionalHistory: [],
  };

  constructor(params: {
    payload: ExecuteOrderRequestPayload;
    account: Account;
    adapter: IBrokerAdapter;
    logger: LoggerInstance;
  }) {
    this.payload = params.payload;
    this.account = params.account;
    this.adapter = params.adapter;
    this.logger = params.logger.child({ traceToken: params.payload.traceToken });
  }
}
```

## 3. Folder Structure for Steps
Logic for each command will be grouped in folders:
`apps/executor-service/src/services/order-handlers/`
- `common/`: Shared steps (Market Hours, Max Positions, Price Resolver).
- `open-order/`: Steps for LONG/SHORT commands.
- `close-order/`: Steps for CLOSE_ALL/CLOSE_BAD commands.
- `update-order/`: Steps for SET_TP_SL/MOVE_SL commands.

## 4. Error Handling
The first middleware will be `ErrorHandlingStep`.
It wraps the `await next()` in a try-catch.
It handles publishing the failure result and updating order history if an error propagates up.
Internal steps can also "Abort" by setting `ctx.state.isAborted = true` without throwing an error (e.g., if market is closed).
