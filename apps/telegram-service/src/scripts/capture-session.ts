import { TelegramClient } from '@mtcute/node';
import * as readline from 'readline';

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

const question = (query: string): Promise<string> => {
  return new Promise((resolve) => {
    rl.question(query, resolve);
  });
};

async function main() {
  console.log('=== Telegram Session Capture ===');
  console.log(
    'This script will help you generate a session string for the Telegram Client.'
  );
  console.log('');

  const apiIdStr = await question('Enter API ID: ');
  const apiHash = await question('Enter API Hash: ');
  const phone = await question(
    'Enter Phone Number (international format, e.g. +1234567890): '
  );

  const apiId = parseInt(apiIdStr, 10);

  if (isNaN(apiId)) {
    console.error('Invalid API ID. It must be a number.');
    process.exit(1);
  }

  const client = new TelegramClient({
    apiId,
    apiHash,
    storage: 'memory', // We only need the session string, not persistent storage
  });

  try {
    const user = await client.start({
      phone,
      code: () => question('Enter the code you received: '),
      password: () => question('Enter your 2FA password: '),
    });

    console.log('');
    console.log(
      `Successfully logged in as ${user.displayName} (@${user.username})`
    );
    console.log('');

    const session = await client.exportSession();

    console.log('=== SESSION STRING ===');
    console.log(session);
    console.log('======================');
    console.log('');
    console.log(
      'Save this string to your configuration (TELEGRAM_SESSION) or database.'
    );
  } catch (err) {
    console.error('Error:', err);
  } finally {
    rl.close();
    // client.close() might hang if not connected, but we should try to close it.
    // In a script, process.exit is often cleaner after output.
    process.exit(0);
  }
}

main();
