import { IStreamConsumer } from '@telegram-trading-bot-mini/shared/utils';

export interface ConsumerRegistry {
  messageConsumer: IStreamConsumer;
  resultConsumer: IStreamConsumer;
  executionResultConsumer: IStreamConsumer;
  priceUpdateConsumer: IStreamConsumer;
}
