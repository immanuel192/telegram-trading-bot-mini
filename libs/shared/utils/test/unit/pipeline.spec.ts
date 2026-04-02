import {
  ActionPipeline,
  BaseActionPipelineContext,
  IPipelineStep,
} from '../../src/pipeline/action-pipeline';
import { LoggerInstance, NoOpErrorCapture } from '../../src';

describe('ActionPipeline', () => {
  interface TestContext extends BaseActionPipelineContext {
    values: string[];
  }

  let pipeline: ActionPipeline<TestContext>;
  let context: TestContext;
  let mockLogger: LoggerInstance;
  let mockErrorCapture: NoOpErrorCapture;

  beforeEach(() => {
    mockLogger = {
      error: jest.fn(),
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      trace: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as any;
    mockErrorCapture = new NoOpErrorCapture();
    jest.spyOn(mockErrorCapture, 'captureException');

    pipeline = new ActionPipeline<TestContext>(mockLogger, mockErrorCapture);
    context = { values: [], state: {} };
  });

  it('should initialize steps via constructor', async () => {
    const steps: IPipelineStep<TestContext>[] = [
      {
        name: 'step1',
        execute: async (ctx, next) => {
          ctx.values.push('1');
          await next();
        },
      },
    ];
    const deferredSteps: IPipelineStep<TestContext>[] = [
      {
        name: 'def1',
        execute: async (ctx) => {
          ctx.values.push('def1');
        },
      },
    ];

    const pipeWithSteps = new ActionPipeline<TestContext>(
      mockLogger,
      mockErrorCapture,
      steps,
      deferredSteps
    );
    await pipeWithSteps.run(context);

    expect(context.values).toEqual(['1', 'def1']);
  });

  it('should execute steps in sequence', async () => {
    pipeline.use({
      name: 'step1',
      execute: async (ctx, next) => {
        ctx.values.push('1');
        await next();
      },
    });

    pipeline.use({
      name: 'step2',
      execute: async (ctx, next) => {
        ctx.values.push('2');
        await next();
      },
    });

    await pipeline.run(context);

    expect(context.values).toEqual(['1', '2']);
  });

  it('should handle nested execution (middleware style)', async () => {
    pipeline.use({
      name: 'wrapper',
      execute: async (ctx, next) => {
        ctx.values.push('before');
        await next();
        ctx.values.push('after');
      },
    });

    pipeline.use({
      name: 'inner',
      execute: async (ctx, next) => {
        ctx.values.push('inner');
        await next();
      },
    });

    await pipeline.run(context);

    expect(context.values).toEqual(['before', 'inner', 'after']);
  });

  it('should stop execution if next() is not called', async () => {
    pipeline.use({
      name: 'stopper',
      execute: async (ctx) => {
        ctx.values.push('stopped');
        // next() not called
      },
    });

    pipeline.use({
      name: 'ignored',
      execute: async (ctx, next) => {
        ctx.values.push('ignored');
        await next();
      },
    });

    await pipeline.run(context);

    expect(context.values).toEqual(['stopped']);
  });

  it('should throw error if next() is called multiple times', async () => {
    pipeline.use({
      name: 'double-caller',
      execute: async (ctx, next) => {
        await next();
        await next();
      },
    });

    await expect(pipeline.run(context)).rejects.toThrow(
      'next() called multiple times'
    );
  });

  it('should execute deferred steps regardless of success', async () => {
    pipeline.use({
      name: 'main',
      execute: async (ctx, next) => {
        ctx.values.push('main');
        await next();
      },
    });

    pipeline.useDeferred({
      name: 'deferred',
      execute: async (ctx) => {
        ctx.values.push('deferred');
      },
    });

    await pipeline.run(context);

    expect(context.values).toEqual(['main', 'deferred']);
  });

  it('should skip deferred steps when main pipeline fails', async () => {
    pipeline.use({
      name: 'failer',
      execute: async () => {
        throw new Error('Main failure');
      },
    });

    pipeline.useDeferred({
      name: 'deferred',
      execute: async (ctx) => {
        ctx.values.push('deferred-run');
      },
    });

    await expect(pipeline.run(context)).rejects.toThrow('Main failure');
    expect(context.values).not.toContain('deferred-run');
  });

  it('should allow deferred steps to access context updated by previous steps', async () => {
    pipeline.use({
      name: 'modifier',
      execute: async (ctx, next) => {
        ctx.values.push('modified');
        await next();
      },
    });

    pipeline.useDeferred({
      name: 'reader',
      execute: async (ctx) => {
        if (ctx.values.includes('modified')) {
          ctx.values.push('read');
        }
      },
    });

    await pipeline.run(context);

    expect(context.values).toEqual(['modified', 'read']);
  });

  it('should execute deferred steps in the order they were registered', async () => {
    pipeline.useDeferred({
      name: 'def1',
      execute: async (ctx) => {
        ctx.values.push('def1');
      },
    });

    pipeline.useDeferred({
      name: 'def2',
      execute: async (ctx) => {
        ctx.values.push('def2');
      },
    });

    await pipeline.run(context);

    expect(context.values).toEqual(['def1', 'def2']);
  });

  it('should log and capture errors from deferred steps', async () => {
    const error = new Error('Deferred failure');
    pipeline.useDeferred({
      name: 'failing-deferred',
      execute: async () => {
        throw error;
      },
    });

    await expect(pipeline.run(context)).rejects.toThrow(error);

    expect(mockLogger.error).toHaveBeenCalledWith(
      error,
      '[Pipeline] Error occurred. Running error handlers'
    );
    expect(mockErrorCapture.captureException).toHaveBeenCalledWith(error, {
      handler: 'pipeline:run',
    });
  });

  describe('Error Handlers', () => {
    it('should execute error handlers when main pipeline fails', async () => {
      const mainError = new Error('Main failure');

      pipeline.use({
        name: 'failer',
        execute: async () => {
          throw mainError;
        },
      });

      pipeline.useErrorHandler({
        name: 'error-handler',
        execute: async (ctx) => {
          ctx.values.push('error-handled');
        },
      });

      await expect(pipeline.run(context)).rejects.toThrow('Main failure');
      expect(context.values).toEqual(['error-handled']);
      expect(context.state.error).toBe(mainError);
    });

    it('should execute error handlers when deferred step fails', async () => {
      const deferredError = new Error('Deferred failure');

      pipeline.use({
        name: 'success',
        execute: async (ctx, next) => {
          ctx.values.push('main');
          await next();
        },
      });

      pipeline.useDeferred({
        name: 'failing-deferred',
        execute: async () => {
          throw deferredError;
        },
      });

      pipeline.useErrorHandler({
        name: 'error-handler',
        execute: async (ctx) => {
          ctx.values.push('error-handled');
        },
      });

      await expect(pipeline.run(context)).rejects.toThrow('Deferred failure');
      expect(context.values).toEqual(['main', 'error-handled']);
      expect(context.state.error).toBe(deferredError);
    });

    it('should NOT execute error handlers when pipeline succeeds', async () => {
      pipeline.use({
        name: 'success',
        execute: async (ctx, next) => {
          ctx.values.push('main');
          await next();
        },
      });

      pipeline.useErrorHandler({
        name: 'error-handler',
        execute: async (ctx) => {
          ctx.values.push('error-handled');
        },
      });

      await pipeline.run(context);
      expect(context.values).toEqual(['main']);
      expect(context.state.error).toBeUndefined();
    });

    it('should execute multiple error handlers in order', async () => {
      pipeline.use({
        name: 'failer',
        execute: async () => {
          throw new Error('Failure');
        },
      });

      pipeline.useErrorHandler({
        name: 'handler1',
        execute: async (ctx) => {
          ctx.values.push('handler1');
        },
      });

      pipeline.useErrorHandler({
        name: 'handler2',
        execute: async (ctx) => {
          ctx.values.push('handler2');
        },
      });

      await expect(pipeline.run(context)).rejects.toThrow('Failure');
      expect(context.values).toEqual(['handler1', 'handler2']);
    });

    it('should continue executing other error handlers if one fails', async () => {
      pipeline.use({
        name: 'failer',
        execute: async () => {
          throw new Error('Main failure');
        },
      });

      const handlerError = new Error('Handler failure');
      pipeline.useErrorHandler({
        name: 'failing-handler',
        execute: async () => {
          throw handlerError;
        },
      });

      pipeline.useErrorHandler({
        name: 'working-handler',
        execute: async (ctx) => {
          ctx.values.push('handler-worked');
        },
      });

      await expect(pipeline.run(context)).rejects.toThrow('Main failure');
      expect(context.values).toEqual(['handler-worked']);
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.objectContaining({
          handler: 'failing-handler',
          error: 'Handler failure',
        }),
        '[Pipeline] Error handler failed'
      );
    });

    it('should set state.error before executing error handlers', async () => {
      const mainError = new Error('Test error');
      let capturedError: Error | undefined;

      pipeline.use({
        name: 'failer',
        execute: async () => {
          throw mainError;
        },
      });

      pipeline.useErrorHandler({
        name: 'error-checker',
        execute: async (ctx) => {
          capturedError = ctx.state.error;
        },
      });

      await expect(pipeline.run(context)).rejects.toThrow('Test error');
      expect(capturedError).toBe(mainError);
    });

    it('should skip deferred steps when main pipeline fails', async () => {
      pipeline.use({
        name: 'failer',
        execute: async () => {
          throw new Error('Main failure');
        },
      });

      pipeline.useDeferred({
        name: 'deferred',
        execute: async (ctx) => {
          ctx.values.push('deferred');
        },
      });

      pipeline.useErrorHandler({
        name: 'handler',
        execute: async (ctx) => {
          ctx.values.push('handler');
        },
      });

      await expect(pipeline.run(context)).rejects.toThrow('Main failure');
      expect(context.values).toEqual(['handler']); // deferred NOT executed
    });
  });
});
