const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed } = require('../../utils/embeds');
const { getDb, getGuildConfig } = require('../../utils/db');
const { parseDuration, formatDuration } = require('../../utils/time');

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

    if (!duration || duration > 2419200) {
      return interaction.reply({ embeds: [errorEmbed('Invalid Duration', 'Duration must be between 1s and 28d.')], ephemeral: true });
    }

    const member = interaction.guild.members.cache.get(user.id);
    if (!member) return interaction.reply({ embeds: [errorEmbed('Not Found', 'User not in server.')], ephemeral: true });
    if (!member.moderatable) return interaction.reply({ embeds: [errorEmbed('Cannot Mute', 'I cannot mute this user.')], ephemeral: true });

    await member.timeout(duration * 1000, reason);

    const db = getDb();
    const now = Math.floor(Date.now() / 1000);
    const result = db.prepare(
      'INSERT INTO infractions (guild_id, user_id, moderator_id, type, reason, duration, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)'
    ).run(interaction.guildId, user.id, interaction.user.id, 'mute', reason, duration, now + duration);

    try { await user.send(`You have been muted in **${interaction.guild.name}** for ${formatDuration(duration)}.\nReason: ${reason}`); } catch {}

    await interaction.reply({ embeds: [successEmbed('User Muted', `**${user.tag || user.username}** muted for ${formatDuration(duration)}.\nCase #${result.lastInsertRowid}`)] });

    const config = getGuildConfig(interaction.guildId);
    if (config.mod_log_channel) {
      const channel = interaction.guild.channels.cache.get(config.mod_log_channel);
      if (channel) channel.send({ embeds: [modLogEmbed('Mute', user, interaction.user, reason, formatDuration(duration), result.lastInsertRowid)] }).catch(() => {});
    }
  },
};
