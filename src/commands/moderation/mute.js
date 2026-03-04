const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed } = require('../../utils/embeds');
const { query, getGuildConfig } = require('../../utils/db');
const { parseDuration, formatDuration, nowUnixSeconds } = require('../../utils/time');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('mute')
    .setDescription('Timeout a user')
    .addUserOption(o => o.setName('user').setDescription('User to mute').setRequired(true))
    .addStringOption(o => o.setName('duration').setDescription('Duration (e.g. 10m, 1h)').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason')),
  permissions: ['ModerateMembers'],
  botPermissions: ['ModerateMembers'],

  async execute(interaction, client) {
    const user = interaction.options.getUser('user');
    const durationStr = interaction.options.getString('duration');
    const reason = interaction.options.getString('reason') || 'No reason provided';
    const duration = parseDuration(durationStr);

    if (user.id === interaction.user.id) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Target', 'You cannot mute yourself.')], ephemeral: true });
    }
    if (user.bot) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Target', 'Bots cannot be timed out.')], ephemeral: true });
    }

    if (!duration || duration > 2419200) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Duration', 'Duration must be between 1s and 28d.')], ephemeral: true });
    }

    const member = interaction.guild.members.cache.get(user.id);
    if (!member) return interaction.reply({ embeds: [errorEmbed('Not Found', 'User not in server.')], ephemeral: true });
    if (!member.moderatable) return interaction.reply({ embeds: [errorEmbed('Cannot Mute', 'I cannot mute this user.')], ephemeral: true });

    try {
      await member.timeout(duration * 1000, reason);
    } catch (err) {
      logger.error(`Mute failed for ${user.id}: ${err.message}`);
      return interaction.reply({ embeds: [errorEmbed('Mute Failed', 'Could not mute this user. Check my permissions and role hierarchy.')], ephemeral: true });
    }

    const now = nowUnixSeconds();
    const result = await query(
      'INSERT INTO infractions (guild_id, user_id, moderator_id, type, reason, duration, expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
      [interaction.guildId, user.id, interaction.user.id, 'mute', reason, duration, now + duration]
    );
    const caseId = result.rows[0].id;

    // DM may fail if user has DMs disabled
    try { await user.send(`You have been muted in **${interaction.guild.name}** for ${formatDuration(duration)}.\nReason: ${reason}`); } catch {}

    await interaction.reply({ embeds: [successEmbed('User Muted', `**${user.tag || user.username}** muted for ${formatDuration(duration)}.\nCase #${caseId}`)] });

    try {
      const config = await getGuildConfig(interaction.guildId);
      if (config.mod_log_channel) {
        const channel = interaction.guild.channels.cache.get(config.mod_log_channel);
        if (channel) channel.send({ embeds: [modLogEmbed('Mute', user, interaction.user, reason, formatDuration(duration), caseId)] })
          .catch(err => logger.warn(`Log send failed: ${err.message}`));
      }
    } catch (err) {
      logger.warn(`Mod log error: ${err.message}`);
    }
  },
};
