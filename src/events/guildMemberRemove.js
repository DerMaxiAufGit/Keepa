const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../utils/db');
const { Colors } = require('../utils/embeds');
const logger = require('../utils/logger');

module.exports = {
  async execute(member, client) {
    let config;
    try {
      config = await getGuildConfig(member.guild.id);
    } catch (err) {
      logger.error(`Failed to get guild config for ${member.guild.id}: ${err.message}`);
      return;
    }

    // Goodbye message
    if (config.goodbye_enabled && config.goodbye_channel && config.goodbye_message) {
      const channel = member.guild.channels.cache.get(config.goodbye_channel);
      if (channel) {
        const text = config.goodbye_message
          .replace(/{user}/g, member.user?.username ?? 'Unknown')
          .replace(/{server}/g, member.guild.name)
          .replace(/{membercount}/g, member.guild.memberCount);
        channel.send(text).catch(err => logger.warn(`Log send failed: ${err.message}`));
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
            { name: 'User', value: `${member.user?.tag || member.user?.username || 'Unknown'} (${member.id})` },
            { name: 'Roles', value: member.roles?.cache.filter(r => r.id !== member.guild.id).map(r => r.toString()).join(', ') || 'None' }
          )
          .setThumbnail(member.user?.displayAvatarURL?.() || null)
          .setTimestamp().setFooter({ text: `Members: ${member.guild.memberCount} | Keepa` });
        logCh.send({ embeds: [embed] }).catch(err => logger.warn(`Log send failed: ${err.message}`));
      }
    }
  },
};
