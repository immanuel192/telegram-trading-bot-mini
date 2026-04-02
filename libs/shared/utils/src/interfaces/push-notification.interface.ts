/**
 * Push notification send options
 */
export interface PushNotificationSendOptions {
  /**
   * @description The message to send
   */
  m: string;
  /**
   * @description The title of the message
   */
  t?: string;
  /**
   * @description Vibrate the device
   */
  v?: "0" | "1" | "2";
  /**
   * @description The device id to send the message to. Use `a` for all devices.
   */
  d: string;
  /**
   * @description Trace token for request tracking
   */
  traceToken: string;
}

/**
 * PushSafer client interface
 */
export interface PushSaferClient {
  send(
    options: PushNotificationSendOptions,
    callback: (err: any, result: any) => void
  ): void;
}





