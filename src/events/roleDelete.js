const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../utils/db');
const { Colors } = require('../utils/embeds');

module.exports = {
  async execute(role, client) {
    const config = getGuildConfig(role.guild.id);
    if (!config.server_log_channel) return;
    const channel = role.guild.channels.cache.get(config.server_log_channel);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(Colors.ERROR)
      .setTitle('Role Deleted')
      .addFields({ name: 'Name', value: role.name })
      .setTimestamp()
      .setFooter({ text: 'Keepa' });

    channel.send({ embeds: [embed] }).catch(() => {});
  },
};
