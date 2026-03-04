const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed } = require('../../utils/embeds');
const { query, getGuildConfig } = require('../../utils/db');
const { truncate } = require('../../utils/strings');
const logger = require('../../utils/logger');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('warn')
    .setDescription('Warn a user')
    .addUserOption(o => o.setName('user').setDescription('User to warn').setRequired(true))
    .addStringOption(o => o.setName('reason').setDescription('Reason').setRequired(true)),
  permissions: ['ModerateMembers'],
  botPermissions: [],

  async execute(interaction, client) {
    const user = interaction.options.getUser('user');
    const reason = interaction.options.getString('reason');

    if (user.id === interaction.user.id) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Target', 'You cannot warn yourself.')], ephemeral: true });
    }
    if (user.bot) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Target', 'Bots cannot be warned.')], ephemeral: true });
    }

    let caseId = '?';
    try {
      const result = await query(
        'INSERT INTO infractions (guild_id, user_id, moderator_id, type, reason) VALUES ($1, $2, $3, $4, $5) RETURNING id',
        [interaction.guildId, user.id, interaction.user.id, 'warn', reason]
      );
      caseId = result.rows[0].id;
    } catch (err) {
      logger.error(`Failed to record warn infraction for ${user.id}: ${err.message}`);
      return interaction.reply({ embeds: [errorEmbed('Partial Failure', 'Warning could not be recorded (DB error).')], ephemeral: true });
    }

    // DM may fail if user has DMs disabled
    try { await user.send(`You have been warned in **${interaction.guild.name}**.\nReason: ${truncate(reason, 1000)}`); } catch {}

    await interaction.reply({ embeds: [successEmbed('User Warned', `**${user.tag || user.username}** has been warned.\nCase #${caseId}`)] });

    try {
      const config = await getGuildConfig(interaction.guildId);
      if (config.mod_log_channel) {
        const channel = interaction.guild.channels.cache.get(config.mod_log_channel);
        if (channel) channel.send({ embeds: [modLogEmbed('Warn', user, interaction.user, reason, null, caseId)] })
          .catch(err => logger.warn(`Log send failed: ${err.message}`));
      }
    } catch (err) {
      logger.warn(`Mod log error: ${err.message}`);
    }
  },
};
