const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../utils/db');
const { Colors } = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  async execute(role, client) {
    let config;
    try {
      config = await getGuildConfig(role.guild.id);
    } catch (err) {
      logger.error(`Failed to get guild config: ${err.message}`);
      return;
    }
    if (!config.server_log_channel) return;
    const channel = role.guild.channels.cache.get(config.server_log_channel);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(Colors.ERROR)
      .setTitle('Role Deleted')
      .addFields({ name: 'Name', value: role.name })
      .setTimestamp()
      .setFooter({ text: 'Keepa' });

    channel.send({ embeds: [embed] }).catch(err => logger.warn(`Log send failed: ${err.message}`));
  },
};
