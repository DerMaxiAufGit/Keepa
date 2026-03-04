const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../utils/db');
const { Colors } = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  async execute(ban, client) {
    let config;
    try {
      config = await getGuildConfig(ban.guild.id);
    } catch (err) {
      logger.error(`Failed to get guild config: ${err.message}`);
      return;
    }
    if (!config.mod_log_channel) return;
    const channel = ban.guild.channels.cache.get(config.mod_log_channel);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(Colors.ERROR)
      .setTitle('Member Banned')
      .addFields(
        { name: 'User', value: `${ban.user.tag || ban.user.username} (${ban.user.id})` },
        { name: 'Reason', value: ban.reason || 'No reason provided' }
      )
      .setThumbnail(ban.user.displayAvatarURL())
      .setTimestamp()
      .setFooter({ text: 'Keepa' });

    channel.send({ embeds: [embed] }).catch(err => logger.warn(`Log send failed: ${err.message}`));
  },
};
