const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed } = require('../../utils/embeds');
const { query, getGuildConfig } = require('../../utils/db');
const { parseDuration, formatDuration, nowUnixSeconds } = require('../../utils/time');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('ban')
    .setDescription('Ban a user from the server')
    .addUserOption(o => o.setName('user').setDescription('User to ban').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason for ban'))
    .addStringOption(o => o.setName('duration').setDescription('Duration (e.g. 7d, perm)'))
    .addIntegerOption(o => o.setName('delete_messages').setDescription('Days of messages to delete').addChoices(
      { name: '0 days', value: 0 },
      { name: '1 day', value: 1 },
      { name: '7 days', value: 7 }
    )),
  permissions: ['BanMembers'],
  botPermissions: ['BanMembers'],

  async execute(interaction, client) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const durationStr = interaction.options.getString('duration');
    const deleteMessages = interaction.options.getInteger('delete_messages') || 0;

    if (user.id === interaction.user.id) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Target', 'You cannot ban yourself.')], ephemeral: true });
    }
    if (user.id === client.user.id) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Target', 'I cannot ban myself.')], ephemeral: true });
    }

    const duration = parseDuration(durationStr);
    if (durationStr && durationStr.toLowerCase() !== 'perm' && durationStr.toLowerCase() !== 'permanent' && !duration) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Duration', 'Provide a valid duration (e.g. 7d, 1h) or "perm".')], ephemeral: true });
    }

    const member = interaction.guild.members.cache.get(user.id);
    if (member && !member.bannable) {
      return interaction.reply({ embeds: [errorEmbed('Cannot Ban', 'I cannot ban this user.')], ephemeral: true });
    }

    try {
      await interaction.guild.members.ban(user, { reason, deleteMessageSeconds: deleteMessages * 86400 });
    } catch (err) {
      logger.error(`Ban failed for ${user.id}: ${err.message}`);
      return interaction.reply({ embeds: [errorEmbed('Ban Failed', 'Could not ban this user. Check my permissions and role hierarchy.')], ephemeral: true });
    }

    const now = nowUnixSeconds();
    const expiresAt = duration ? now + duration : null;

    const result = await query(
      'INSERT INTO infractions (guild_id, user_id, moderator_id, type, reason, duration, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [interaction.guildId, user.id, interaction.user.id, 'ban', reason, duration, expiresAt]
    );

    const caseId = result.rows[0].id;

    // DM after action succeeds — may fail if user has DMs disabled
    try {
      await user.send(`You have been banned from **${interaction.guild.name}**.\nReason: ${reason}${duration ? `\nDuration: ${formatDuration(duration)}` : ''}`);
    } catch {}

    await interaction.reply({ embeds: [successEmbed('User Banned', `**${user.tag || user.username}** has been banned.\nCase #${caseId}`)] });

    try {
      const config = await getGuildConfig(interaction.guildId);
      if (config.mod_log_channel) {
        const channel = interaction.guild.channels.cache.get(config.mod_log_channel);
        if (channel) {
          channel.send({ embeds: [modLogEmbed('Ban', user, interaction.user, reason, duration ? formatDuration(duration) : null, caseId)] })
            .catch(err => logger.warn(`Log send failed: ${err.message}`));
        }
      }
    } catch (err) {
      logger.warn(`Mod log error: ${err.message}`);
    }
  },
};
