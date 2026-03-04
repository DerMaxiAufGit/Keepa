const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed } = require('../../utils/embeds');
const { getDb, getGuildConfig } = require('../../utils/db');
const { parseDuration, formatDuration } = require('../../utils/time');
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
    const duration = parseDuration(durationStr);

    const member = interaction.guild.members.cache.get(user.id);
    if (member && !member.bannable) {
      return interaction.reply({ embeds: [errorEmbed('Cannot Ban', 'I cannot ban this user.')], ephemeral: true });
    }

    // DM user before ban
    try {
      await user.send(`You have been banned from **${interaction.guild.name}**.\nReason: ${reason}${duration ? `\nDuration: ${formatDuration(duration)}` : ''}`);
    } catch {}

    await interaction.guild.members.ban(user, { reason, deleteMessageSeconds: deleteMessages * 86400 });

    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = duration ? now + duration : null;

    const result = db.prepare(
      'INSERT INTO infractions (guild_id, user_id, moderator_id, type, reason, duration, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(interaction.guildId, user.id, interaction.user.id, 'ban', reason, duration, expiresAt);

    const caseId = result.lastInsertRowid;

    await interaction.reply({ embeds: [successEmbed('User Banned', `**${user.tag || user.username}** has been banned.\nCase #${caseId}`)] });

    // Mod log
    const config = getGuildConfig(interaction.guildId);
    if (config.mod_log_channel) {
      const channel = interaction.guild.channels.cache.get(config.mod_log_channel);
      if (channel) {
        channel.send({ embeds: [modLogEmbed('Ban', user, interaction.user, reason, duration ? formatDuration(duration) : null, caseId)] }).catch(() => {});
      }
    }
  },
};
