/**
 * Purpose: Define the ConsumerRegistry interface for managing stream consumers.
 */

import { IStreamConsumer } from '@telegram-trading-bot-mini/shared/utils';

export interface ConsumerRegistry {
  requestConsumer: IStreamConsumer;
}
