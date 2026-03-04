const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

function loadEvents(client) {
  const eventsDir = path.join(__dirname, '..', 'events');
  const files = fs.readdirSync(eventsDir).filter(f => f.endsWith('.js'));

  for (const file of files) {
    const event = require(path.join(eventsDir, file));
    const eventName = file.replace('.js', '');

    if (event.once) {
      client.once(eventName, (...args) => event.execute(...args, client));
    } else {
      client.on(eventName, (...args) => event.execute(...args, client));
    }

    logger.debug(`Loaded event: ${eventName}`);
  }

  logger.info(`Loaded ${files.length} events`);
}

module.exports = { loadEvents };
