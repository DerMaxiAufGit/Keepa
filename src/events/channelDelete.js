const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../utils/db');
const { Colors } = require('../utils/embeds');

module.exports = {
  async execute(ch, client) {
    if (!ch.guild) return;
    const config = getGuildConfig(ch.guild.id);
    if (!config.server_log_channel) return;
    const logCh = ch.guild.channels.cache.get(config.server_log_channel);
    if (!logCh) return;

    const embed = new EmbedBuilder()
      .setColor(Colors.ERROR)
      .setTitle('Channel Deleted')
      .addFields({ name: 'Name', value: ch.name, inline: true }, { name: 'Type', value: `${ch.type}`, inline: true })
      .setTimestamp()
      .setFooter({ text: 'Keepa' });

    logCh.send({ embeds: [embed] }).catch(() => {});
  },
};
