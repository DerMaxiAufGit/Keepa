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
      .setColor(Colors.SUCCESS)
      .setTitle('Role Created')
      .addFields({ name: 'Name', value: role.name }, { name: 'Color', value: role.hexColor, inline: true })
      .setTimestamp()
      .setFooter({ text: 'Keepa' });

    channel.send({ embeds: [embed] }).catch(() => {});
  },
};
