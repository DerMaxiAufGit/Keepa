const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed } = require('../../utils/embeds');
const { getDb, getGuildConfig } = require('../../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unban')
    .setDescription('Unban a user')
    .addStringOption(o => o.setName('user_id').setDescription('User ID to unban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for unban')),
  permissions: ['BanMembers'],
  botPermissions: ['BanMembers'],

  async execute(interaction, client) {
    const userId = interaction.options.getString('user_id');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    try {
      await interaction.guild.members.unban(userId, reason);
    } catch {
      return interaction.reply({ embeds: [errorEmbed('Unban Failed', 'Could not unban that user. Check the ID.')], ephemeral: true });
    }

    const db = getDb();
    db.prepare(
      'UPDATE infractions SET active = 0 WHERE guild_id = ? AND user_id = ? AND type = ? AND active = 1'
    ).run(interaction.guildId, userId, 'ban');

    const user = await client.users.fetch(userId).catch(() => ({ id: userId, username: userId, tag: userId }));

    await interaction.reply({ embeds: [successEmbed('User Unbanned', `**${user.tag || user.username}** has been unbanned.`)] });

    const config = getGuildConfig(interaction.guildId);
    if (config.mod_log_channel) {
      const channel = interaction.guild.channels.cache.get(config.mod_log_channel);
      if (channel) {
        channel.send({ embeds: [modLogEmbed('Unban', user, interaction.user, reason, null, '-')] }).catch(() => {});
      }
    }
  },
};
