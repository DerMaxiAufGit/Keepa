const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../utils/db');
const { Colors } = require('../utils/embeds');

module.exports = {
  async execute(message, client) {
    if (!message.guild || message.author?.bot) return;
    const config = getGuildConfig(message.guild.id);
    if (!config.message_log_channel) return;

    const channel = message.guild.channels.cache.get(config.message_log_channel);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(Colors.ERROR)
      .setTitle('Message Deleted')
      .addFields(
        { name: 'Author', value: `${message.author?.tag || 'Unknown'} (${message.author?.id || 'N/A'})`, inline: true },
        { name: 'Channel', value: `<#${message.channelId}>`, inline: true },
        { name: 'Content', value: message.content?.slice(0, 1024) || '*No text content*' }
      )
      .setTimestamp()
      .setFooter({ text: 'Keepa' });

    channel.send({ embeds: [embed] }).catch(() => {});
  },
};
