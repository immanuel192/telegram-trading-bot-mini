/**
 * IPipelineStep interface and ActionPipeline runner
 * Supports middleware-style execution with "deferred" steps and error handlers.
 */

import { LoggerInstance } from '../interfaces';
import { IErrorCapture } from '../error-capture';

export type NextFunction = () => Promise<void>;

export interface BaseActionPipelineContext {
  state: {
    error?: Error;
    [k: string]: any;
  };
  [k: string]: any;
}

export interface IPipelineStep<TContext extends BaseActionPipelineContext> {
  name: string;
  execute(ctx: TContext, next: NextFunction): Promise<void>;
}

export class ActionPipeline<TContext extends BaseActionPipelineContext> {
  constructor(
    private readonly logger: LoggerInstance,
    private readonly errorCapture: IErrorCapture,
    private steps: IPipelineStep<TContext>[] = [],
    private deferredSteps: IPipelineStep<TContext>[] = [],
    private errorHandlers: IPipelineStep<TContext>[] = []
  ) {}

  /**
   * Register a step to be executed in the main pipeline flow.
   */
  use(step: IPipelineStep<TContext>): this {
    this.steps.push(step);
    return this;
  }

  /**
   * Register a step to be executed ONLY after successful main pipeline completion.
   * Deferred steps do NOT run if the main pipeline fails.
   * Useful for publishing results, committing transactions, etc.
   */
  useDeferred(step: IPipelineStep<TContext>): this {
    this.deferredSteps.push(step);
    return this;
  }

  /**
   * Register an error handler to be executed if ANY error occurs.
   * Error handlers run in a finally block when errors occur.
   * Useful for cleanup operations like transaction rollback, resource cleanup, etc.
   *
   * Error handlers check the context to determine what cleanup is needed.
   */
  useErrorHandler(step: IPipelineStep<TContext>): this {
    this.errorHandlers.push(step);
    return this;
  }

  /**
   * Run the pipeline with the provided context.
   *
   * Flow:
   * 1. Run main steps
   * 2. If success: run deferred steps
   * 3. If error: set state.error → error handlers run in finally
   */
  async run(ctx: TContext): Promise<void> {
    let index = -1;

    const dispatch = async (i: number): Promise<void> => {
      if (i <= index) {
        throw new Error('next() called multiple times');
      }
      index = i;
      const step = this.steps[i];
      if (step) {
        await step.execute(ctx, () => dispatch(i + 1));
      }
    };

    try {
      // Run main pipeline steps
      await dispatch(0);

      // Success: run deferred steps
      for (const step of this.deferredSteps) {
        await step.execute(ctx, async () => {});
      }
    } catch (error) {
      this.logger.error(
        error,
        '[Pipeline] Error occurred. Running error handlers'
      );
      // capture the error before calling error handling steps
      ctx.state.error = error as Error;
      this.errorCapture.captureException(error as Error, {
        handler: 'pipeline:run',
      });
      for (const handler of this.errorHandlers) {
        try {
          await handler.execute(ctx, async () => {});
        } catch (handlerError) {
          // Log error handler failures but don't let them prevent other handlers
          this.logger.error(
            { handler: handler.name, error: (handlerError as Error).message },
            '[Pipeline] Error handler failed'
          );
          this.errorCapture.captureException(handlerError as Error, {
            handler: handler.name,
            phase: 'error-handler',
          });
        }
      }
      // Re-throw the original error so the caller knows it failed
      throw error;
    }
  }
}
