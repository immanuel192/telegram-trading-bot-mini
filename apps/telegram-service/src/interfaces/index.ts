import { ConfigRepository, TelegramChannelRepository } from '@dal';
import { User } from '@mtcute/core';
import {
  LoggerInstance,
  IStreamPublisher,
} from '@telegram-trading-bot-mini/shared/utils';

export interface ITelegramClientService {
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  getMe(): Promise<User | null>;
}

export interface IHttpServer {
  start(): Promise<void>;
  stop(): Promise<void>;
}

export interface Container {
  logger: LoggerInstance;
  telegramService: ITelegramClientService;
  configRepository: ConfigRepository;
  telegramChannelRepository: TelegramChannelRepository;
  streamPublisher: IStreamPublisher;
}
