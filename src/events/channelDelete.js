const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../utils/db');
const { Colors } = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  async execute(ch, client) {
    if (!ch.guild) return;
    let config;
    try {
      config = await getGuildConfig(ch.guild.id);
    } catch (err) {
      logger.error(`Failed to get guild config: ${err.message}`);
      return;
    }
    if (!config.server_log_channel) return;
    const logCh = ch.guild.channels.cache.get(config.server_log_channel);
    if (!logCh) return;

    const embed = new EmbedBuilder()
      .setColor(Colors.ERROR)
      .setTitle('Channel Deleted')
      .addFields({ name: 'Name', value: ch.name, inline: true }, { name: 'Type', value: `${ch.type}`, inline: true })
      .setTimestamp()
      .setFooter({ text: 'Keepa' });

    logCh.send({ embeds: [embed] }).catch(err => logger.warn(`Log send failed: ${err.message}`));
  },
};
