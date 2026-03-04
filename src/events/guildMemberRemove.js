const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../utils/db');
const { Colors } = require('../utils/embeds');

module.exports = {
  async execute(member, client) {
    const config = getGuildConfig(member.guild.id);

    // Goodbye message
    if (config.goodbye_channel && config.goodbye_message) {
      const channel = member.guild.channels.cache.get(config.goodbye_channel);
      if (channel) {
        const text = config.goodbye_message
          .replace(/{user}/g, member.user.username)
          .replace(/{server}/g, member.guild.name)
          .replace(/{membercount}/g, member.guild.memberCount);
        channel.send(text).catch(() => {});
      }
    }

    // Member log
    if (config.member_log_channel) {
      const logCh = member.guild.channels.cache.get(config.member_log_channel);
      if (logCh) {
        const embed = new EmbedBuilder()
          .setColor(Colors.ERROR)
          .setTitle('Member Left')
          .addFields(
            { name: 'User', value: `${member.user.tag || member.user.username} (${member.id})` },
            { name: 'Roles', value: member.roles.cache.filter(r => r.id !== member.guild.id).map(r => r.toString()).join(', ') || 'None' }
          )
          .setThumbnail(member.user.displayAvatarURL())
          .setTimestamp().setFooter({ text: `Members: ${member.guild.memberCount} | Keepa` });
        logCh.send({ embeds: [embed] }).catch(() => {});
      }
    }
  },
};
