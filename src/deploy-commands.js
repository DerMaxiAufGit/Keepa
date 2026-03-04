require('dotenv').config();
const { REST, Routes } = require('discord.js');
const fs = require('fs');
const path = require('path');
const logger = require('./utils/logger');

const commands = [];
const commandsDir = path.join(__dirname, 'commands');

const categories = fs.readdirSync(commandsDir).filter(f =>
  fs.statSync(path.join(commandsDir, f)).isDirectory()
);

for (const category of categories) {
  const files = fs.readdirSync(path.join(commandsDir, category)).filter(f => f.endsWith('.js'));
  for (const file of files) {
    const command = require(path.join(commandsDir, category, file));
    if (command.data) commands.push(command.data.toJSON());
  }
}

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    logger.info(`Registering ${commands.length} commands...`);

    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      logger.info(`Registered ${commands.length} guild commands`);
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands }
      );
      logger.info(`Registered ${commands.length} global commands`);
    }
  } catch (err) {
    logger.error('Failed to register commands:', err);
  }
})();
