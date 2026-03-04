const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../utils/db');
const { Colors } = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  async execute(oldMessage, newMessage, client) {
    if (!newMessage.guild || newMessage.author?.bot) return;
    if (oldMessage.content === newMessage.content) return;
    let config;
    try {
      config = await getGuildConfig(newMessage.guild.id);
    } catch (err) {
      logger.error(`Failed to get guild config: ${err.message}`);
      return;
    }
    if (!config.message_log_channel) return;

    const channel = newMessage.guild.channels.cache.get(config.message_log_channel);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(Colors.WARN)
      .setTitle('Message Edited')
      .addFields(
        { name: 'Author', value: `${newMessage.author?.tag || 'Unknown'} (${newMessage.author?.id || 'N/A'})`, inline: true },
        { name: 'Channel', value: `<#${newMessage.channelId}>`, inline: true },
        { name: 'Before', value: oldMessage.content?.slice(0, 1024) || '*Empty*' },
        { name: 'After', value: newMessage.content?.slice(0, 1024) || '*Empty*' }
      )
      .setTimestamp()
      .setFooter({ text: 'Keepa' });

    channel.send({ embeds: [embed] }).catch(err => logger.warn(`Log send failed: ${err.message}`));
  },
};
