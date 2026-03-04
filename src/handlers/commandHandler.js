const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

function loadCommands(client) {
  const commandsDir = path.join(__dirname, '..', 'commands');
  const categories = fs.readdirSync(commandsDir).filter(f =>
    fs.statSync(path.join(commandsDir, f)).isDirectory()
  );

  for (const category of categories) {
    const categoryDir = path.join(commandsDir, category);
    const files = fs.readdirSync(categoryDir).filter(f => f.endsWith('.js'));

    for (const file of files) {
      const command = require(path.join(categoryDir, file));
      if (command.data && command.execute) {
        client.commands.set(command.data.name, command);
        logger.debug(`Loaded command: ${command.data.name}`);
      }
    }
  }

  logger.info(`Loaded ${client.commands.size} commands`);
}

module.exports = { loadCommands };
