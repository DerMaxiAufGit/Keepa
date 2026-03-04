const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed } = require('../../utils/embeds');
const { query, getGuildConfig } = require('../../utils/db');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('unmute')
    .setDescription('Remove timeout from a user')
    .addUserOption(o => o.setName('user').setDescription('User to unmute').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  permissions: ['ModerateMembers'],
  botPermissions: ['ModerateMembers'],

  async execute(interaction, client) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (user.id === interaction.user.id) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Target', 'You cannot unmute yourself.')], ephemeral: true });
    }

    const member = interaction.guild.members.cache.get(user.id);
    if (!member) return interaction.reply({ embeds: [errorEmbed('Not Found', 'User not in server.')], ephemeral: true });

    try {
      await member.timeout(null, reason);
    } catch (err) {
      logger.error(`Unmute failed for ${user.id}: ${err.message}`);
      return interaction.reply({ embeds: [errorEmbed('Unmute Failed', 'Could not unmute this user.')], ephemeral: true });
    }

    await query(
      'UPDATE infractions SET active = 0 WHERE guild_id = $1 AND user_id = $2 AND type = $3 AND active = 1',
      [interaction.guildId, user.id, 'mute']
    );

    await interaction.reply({ embeds: [successEmbed('User Unmuted', `**${user.tag || user.username}** has been unmuted.`)] });

    try {
      const config = await getGuildConfig(interaction.guildId);
      if (config.mod_log_channel) {
        const channel = interaction.guild.channels.cache.get(config.mod_log_channel);
        if (channel) channel.send({ embeds: [modLogEmbed('Unmute', user, interaction.user, reason, null, '-')] })
          .catch(err => logger.warn(`Log send failed: ${err.message}`));
      }
    } catch (err) {
      logger.warn(`Mod log error: ${err.message}`);
    }
  },
};
