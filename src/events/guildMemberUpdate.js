const { EmbedBuilder } = require('discord.js');
const { getGuildConfig } = require('../utils/db');
const { Colors } = require('../utils/embeds');

module.exports = {
  async execute(oldMember, newMember, client) {
    const config = getGuildConfig(newMember.guild.id);
    if (!config.member_log_channel) return;
    const channel = newMember.guild.channels.cache.get(config.member_log_channel);
    if (!channel) return;

    // Role changes
    const addedRoles = newMember.roles.cache.filter(r => !oldMember.roles.cache.has(r.id));
    const removedRoles = oldMember.roles.cache.filter(r => !newMember.roles.cache.has(r.id));

    if (addedRoles.size > 0 || removedRoles.size > 0) {
      const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle('Member Roles Updated')
        .addFields({ name: 'Member', value: `${newMember.user.tag || newMember.user.username} (${newMember.id})` })
        .setTimestamp()
        .setFooter({ text: 'Keepa' });

      if (addedRoles.size > 0) embed.addFields({ name: 'Added', value: addedRoles.map(r => r.toString()).join(', ') });
      if (removedRoles.size > 0) embed.addFields({ name: 'Removed', value: removedRoles.map(r => r.toString()).join(', ') });

      channel.send({ embeds: [embed] }).catch(() => {});
    }

    // Nickname changes
    if (oldMember.nickname !== newMember.nickname) {
      const embed = new EmbedBuilder()
        .setColor(Colors.INFO)
        .setTitle('Nickname Changed')
        .addFields(
          { name: 'Member', value: `${newMember.user.tag || newMember.user.username} (${newMember.id})` },
          { name: 'Before', value: oldMember.nickname || '*None*', inline: true },
          { name: 'After', value: newMember.nickname || '*None*', inline: true }
        )
        .setTimestamp()
        .setFooter({ text: 'Keepa' });

      channel.send({ embeds: [embed] }).catch(() => {});
    }
  },
};
