const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed } = require('../../utils/embeds');
const { query, getGuildConfig } = require('../../utils/db');
const { truncate } = require('../../utils/strings');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('kick')
    .setDescription('Kick a user from the server')
    .addUserOption(o => o.setName('user').setDescription('User to kick').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for kick')),
  permissions: ['KickMembers'],
  botPermissions: ['KickMembers'],

  async execute(interaction, client) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';

    if (user.id === interaction.user.id) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Target', 'You cannot kick yourself.')], ephemeral: true });
    }
    if (user.bot) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Target', 'Use the bot settings to remove a bot.')], ephemeral: true });
    }

    const member = interaction.guild.members.cache.get(user.id);
    if (!member) return interaction.reply({ embeds: [errorEmbed('Not Found', 'User not in server.')], ephemeral: true });
    if (!member.kickable) return interaction.reply({ embeds: [errorEmbed('Cannot Kick', 'I cannot kick this user.')], ephemeral: true });

    try {
      await member.kick(reason);
    } catch (err) {
      logger.error(`Kick failed for ${user.id}: ${err.message}`);
      return interaction.reply({ embeds: [errorEmbed('Kick Failed', 'Could not kick this user. Check my permissions and role hierarchy.')], ephemeral: true });
    }

    let caseId = '?';
    try {
      const result = await query(
        'INSERT INTO infractions (guild_id, user_id, moderator_id, type, reason) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [interaction.guildId, user.id, interaction.user.id, 'kick', reason]
      );
      caseId = result.rows[0].id;
    } catch (err) {
      logger.error(`Failed to record kick infraction for ${user.id}: ${err.message}`);
      return interaction.reply({ embeds: [errorEmbed('Partial Failure', 'User was kicked but the infraction could not be recorded (DB error).')], ephemeral: true });
    }

    // DM after action succeeds — may fail if user has DMs disabled
    try { await user.send(`You have been kicked from **${interaction.guild.name}**.\nReason: ${truncate(reason, 1000)}`); } catch {}

    await interaction.reply({ embeds: [successEmbed('User Kicked', `**${user.tag || user.username}** has been kicked.\nCase #${caseId}`)] });

    try {
      const config = await getGuildConfig(interaction.guildId);
      if (config.mod_log_channel) {
        const channel = interaction.guild.channels.cache.get(config.mod_log_channel);
        if (channel) channel.send({ embeds: [modLogEmbed('Kick', user, interaction.user, reason, null, caseId)] })
          .catch(err => logger.warn(`Log send failed: ${err.message}`));
      }
    } catch (err) {
      logger.warn(`Mod log error: ${err.message}`);
    }
  },
};
