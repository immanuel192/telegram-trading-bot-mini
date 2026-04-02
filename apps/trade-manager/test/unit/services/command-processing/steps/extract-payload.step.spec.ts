import { ExtractOrderCreationPayloadStep } from '../../../../../src/services/command-processing/steps/extract-payload.step';
import { suiteName } from '@telegram-trading-bot-mini/shared/test-utils';
import { CommandEnum } from '@telegram-trading-bot-mini/shared/utils';

describe(suiteName(__filename), () => {
  let step: ExtractOrderCreationPayloadStep;
  let mockNext: jest.Mock;
  let mockContext: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockNext = jest.fn();

    step = new ExtractOrderCreationPayloadStep();

    mockContext = {
      state: {
        executePayloads: [],
      },
    };
  });

  it('should extract LONG payload', async () => {
    const payloads = [
      { orderId: 'id-1', command: CommandEnum.CANCEL },
      { orderId: 'id-2', command: CommandEnum.LONG },
    ];
    mockContext.state.executePayloads = payloads;

    await step.execute(mockContext, mockNext);

    expect(mockContext.state.orderCreationPayload).toEqual(payloads[1]);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should extract SHORT payload', async () => {
    const payloads = [{ orderId: 'id-2', command: CommandEnum.SHORT }];
    mockContext.state.executePayloads = payloads;

    await step.execute(mockContext, mockNext);

    expect(mockContext.state.orderCreationPayload).toEqual(payloads[0]);
    expect(mockNext).toHaveBeenCalled();
  });

  it('should set undefined if no trade command found', async () => {
    const payloads = [{ orderId: 'id-1', command: CommandEnum.MOVE_SL }];
    mockContext.state.executePayloads = payloads;

    await step.execute(mockContext, mockNext);

    expect(mockContext.state.orderCreationPayload).toBeUndefined();
    expect(mockNext).toHaveBeenCalled();
  });
});
