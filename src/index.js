require('dotenv').config();
const { createClient } = require('./client');
const { init: initDb } = require('./utils/db');
const { loadCommands } = require('./handlers/commandHandler');
const { loadEvents } = require('./handlers/eventHandler');
const { startCronJobs } = require('./cron');
const logger = require('./utils/logger');

const client = createClient();

// Attach DB
client.db = initDb();

// Load commands and events
loadCommands(client);
loadEvents(client);

// Start cron jobs
startCronJobs(client);

// Global error handlers
process.on('unhandledRejection', (err) => logger.error('Unhandled rejection:', err));
process.on('uncaughtException', (err) => logger.error('Uncaught exception:', err));

client.login(process.env.DISCORD_TOKEN);
