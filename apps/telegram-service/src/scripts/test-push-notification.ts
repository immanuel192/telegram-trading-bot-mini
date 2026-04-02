#!/usr/bin/env ts-node
/**
 * Test script for PushNotificationService
 *
 * This script sends a real push notification using the PushSafer API.
 *
 * Usage:
 *   PUSHSAFER_API_KEY=your-api-key ts-node scripts/test-push-notification.ts
 *
 * Or set PUSHSAFER_API_KEY in your environment and run:
 *   ts-node scripts/test-push-notification.ts
 */

import { PushNotificationService } from '../../../../libs/shared/utils/src/push-notification';
import pino from 'pino';

async function main() {
  // Get API key from environment
  const apiKey = process.env.PUSHSAFER_API_KEY;

  if (!apiKey) {
    console.error(
      '❌ Error: PUSHSAFER_API_KEY environment variable is not set',
    );
    console.error('');
    console.error('Usage:');
    console.error(
      '  PUSHSAFER_API_KEY=your-api-key ts-node scripts/test-push-notification.ts',
    );
    process.exit(1);
  }

  console.log(`API Key = ${apiKey}`);
  console.log('🚀 Testing Push Notification Service...');
  console.log('');

  // Create logger
  const logger = pino({
    level: 'info',
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
      },
    },
  });

  // Create push notification service
  const pushService = new PushNotificationService({
    apiKey,
    concurrency: 1,
    logger,
  });

  try {
    console.log('📤 Sending test notification...');

    const result = await pushService.send({
      m: 'This is a test notification from telegram-trading-bot-mini',
      t: 'Test Notification',
      d: 'a', // Send to all devices
      v: '1', // Enable vibration
      traceToken: `test-${Date.now()}`,
    });

    console.log('');
    console.log('✅ Notification sent successfully!');
    console.log('Response:', result);
    console.log('');
    console.log('Check your device for the notification.');

    // Wait for queue to drain
    await pushService.drain();

    // Clean up
    pushService.kill();

    process.exit(0);
  } catch (error) {
    console.error('');
    console.error('❌ Failed to send notification:');
    console.error(error);
    console.error('');

    pushService.kill();
    process.exit(1);
  }
}

main();
