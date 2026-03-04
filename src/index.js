require('dotenv').config();
const { createClient } = require('./client');
const { init: initDb } = require('./utils/db');
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');
const { startCronJobs } = require('./cron');
const logger = require('./utils/logger');

const REQUIRED_ENV = ['DISCORD_TOKEN', 'DATABASE_URL'];

(async () => {
  const missing = REQUIRED_ENV.filter(key => !process.env[key]);
  if (missing.length > 0) {
    logger.error(`Missing required environment variables: ${missing.join(', ')}`);
    process.exit(1);
  }

  const client = createClient();

  await initDb();

  loadCommands(client);
  loadEvents(client);
  startCronJobs(client);

  process.on('unhandledRejection', (err) => logger.error('Unhandled rejection:', err));
  process.on('uncaughtException', (err) => logger.error('Uncaught exception:', err));

  await client.login(process.env.DISCORD_TOKEN);
})();
