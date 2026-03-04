const { runAutomod } = require('../handlers/automodHandler');

module.exports = {
  async execute(message, client) {
    if (!message.guild || message.author.bot) return;
    await runAutomod(message, client);
  },
};
