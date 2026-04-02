/**
 * Purpose: Orchestrator service for command processing pipelines.
 * Initializes and manages pipelines for different trading commands.
 */

import {
  ActionPipeline,
  LoggerInstance,
  IErrorCapture,
  IStreamPublisher,
  PriceCacheService,
} from '@telegram-trading-bot-mini/shared/utils';
import {
  CommandProcessingContext,
  TranslateMessageResultCommand,
} from './command-processing/execution-context';
import { OrderService } from './order.service';
import { CommandTransformerService } from './command-transformer.service';
import { TelegramMessageRepository, Account } from '@dal';
import { PushNotificationService } from '@telegram-trading-bot-mini/shared/utils';
import { MessageEditCheckStep } from './command-processing/steps/message-edit.step';
import { CommandTransformationStep } from './command-processing/steps/transform-command.step';
import { ValidateEntryPriceStep } from './command-processing/steps/validate-entry.step';
import { OrderCreationStep } from './command-processing/steps/create-order.step';
import { PublishExecutionRequestStep } from './command-processing/steps/publish-request.step';
import { CaptureAuditMetadataStep } from './command-processing/steps/audit-metadata.step';
import { NoPayloadsCheckStep } from './command-processing/steps/no-payloads-check.step';
import { ExtractOrderCreationPayloadStep } from './command-processing/steps/extract-payload.step';

export interface CreatePipelineContextParams {
  account: Account;
  command: TranslateMessageResultCommand;
  messageId: number;
  channelId: string;
  traceToken: string;
  sentryTrace?: string;
  sentryBaggage?: string;
}

export class CommandProcessingPipelineService {
  private readonly pipeline: ActionPipeline<CommandProcessingContext>;

  constructor(
    private readonly logger: LoggerInstance,
    private readonly errorCapture: IErrorCapture,
    private readonly orderService: OrderService,
    private readonly pushNotificationService: PushNotificationService,
    private readonly commandTransformerService: CommandTransformerService,
    private readonly priceCacheService: PriceCacheService,
    private readonly streamPublisher: IStreamPublisher,
    private readonly telegramMessageRepository: TelegramMessageRepository,
  ) {
    this.pipeline = new ActionPipeline<CommandProcessingContext>(
      this.logger,
      this.errorCapture,
    );

    this.initializePipeline();
  }

  /**
   * Initialize the unified pipeline with all steps in sequence.
   */
  private initializePipeline(): void {
    this.pipeline
      .use(
        new MessageEditCheckStep(
          this.orderService,
          this.pushNotificationService,
          this.logger,
        ),
      )
      .use(new CommandTransformationStep(this.commandTransformerService))
      .use(new NoPayloadsCheckStep(this.logger))
      // Order Creation Steps
      .use(new ExtractOrderCreationPayloadStep())
      .use(new ValidateEntryPriceStep(this.priceCacheService, this.logger))
      .use(new OrderCreationStep(this.orderService, this.logger))
      // End Order Creation Steps
      .use(
        new PublishExecutionRequestStep(
          this.streamPublisher,
          this.telegramMessageRepository,
          this.logger,
        ),
      )
      .use(
        new CaptureAuditMetadataStep(
          this.priceCacheService,
          this.telegramMessageRepository,
          this.logger,
        ),
      );
  }

  /**
   * Create a safe execution context for the pipeline.
   */
  createContext(params: CreatePipelineContextParams): CommandProcessingContext {
    return {
      messageContext: {
        messageId: params.messageId,
        channelId: params.channelId,
        traceToken: params.traceToken,
        sentryTrace: params.sentryTrace,
        sentryBaggage: params.sentryBaggage,
      },
      state: {
        account: params.account,
        command: params.command,
        executePayloads: [],
        skipNormalFlow: false,
        orderCreated: false,
      },
    };
  }

  /**
   * Execute the unified pipeline for a given command.
   */
  async process(ctx: CommandProcessingContext): Promise<void> {
    await this.pipeline.run(ctx);
  }
}
