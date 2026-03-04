const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../utils/db');
const { Colors } = require('../utils/embeds');

module.exports = {
  async execute(ban, client) {
    const config = getGuildConfig(ban.guild.id);
    if (!config.mod_log_channel) return;
    const channel = ban.guild.channels.cache.get(config.mod_log_channel);
    if (!channel) return;

    const embed = new EmbedBuilder()
      .setColor(Colors.SUCCESS)
      .setTitle('Member Unbanned')
      .addFields({ name: 'User', value: `${ban.user.tag || ban.user.username} (${ban.user.id})` })
      .setThumbnail(ban.user.displayAvatarURL())
      .setTimestamp()
      .setFooter({ text: 'Keepa' });

    channel.send({ embeds: [embed] }).catch(() => {});
  },
};
