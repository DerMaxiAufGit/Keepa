const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed } = require('../../utils/embeds');
const { query, getGuildConfig } = require('../../utils/db');
const logger = require('../../utils/logger');

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

    if (!/^\d{17,20}$/.test(userId)) {
      return interaction.reply({ embeds: [errorEmbed('Invalid ID', 'Please provide a valid Discord user ID (17-20 digits).')], ephemeral: true });
    }

    try {
      await interaction.guild.members.unban(userId, reason);
    } catch {
      return interaction.reply({ embeds: [errorEmbed('Unban Failed', 'Could not unban that user. Check the ID.')], ephemeral: true });
    }

    try {
      await query(
        'UPDATE infractions SET active = 0 WHERE guild_id = $1 AND user_id = $2 AND type = $3 AND active = 1',
        [interaction.guildId, userId, 'ban']
      );
    } catch (err) {
      logger.error(`Failed to update ban infraction for ${userId}: ${err.message}`);
      return interaction.reply({ embeds: [errorEmbed('Partial Failure', 'User was unbanned but the infraction record could not be updated (DB error).')], ephemeral: true });
    }

    const user = await client.users.fetch(userId).catch(() => ({ id: userId, username: userId }));

    await interaction.reply({ embeds: [successEmbed('User Unbanned', `**${user.username}** has been unbanned.`)] });

    try {
      const config = await getGuildConfig(interaction.guildId);
      if (config.mod_log_channel) {
        const channel = interaction.guild.channels.cache.get(config.mod_log_channel);
        if (channel) {
          channel.send({ embeds: [modLogEmbed('Unban', user, interaction.user, reason, null, '-')] })
            .catch(err => logger.warn(`Log send failed: ${err.message}`));
        }
      }
    } catch (err) {
      logger.warn(`Mod log error: ${err.message}`);
    }
  },
};
