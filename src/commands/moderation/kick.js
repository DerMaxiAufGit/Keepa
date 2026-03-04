const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed } = require('../../utils/embeds');
const { getDb, getGuildConfig } = require('../../utils/db');

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
    const member = interaction.guild.members.cache.get(user.id);

    if (!member) return interaction.reply({ embeds: [errorEmbed('Not Found', 'User not in server.')], ephemeral: true });
    if (!member.kickable) return interaction.reply({ embeds: [errorEmbed('Cannot Kick', 'I cannot kick this user.')], ephemeral: true });

    try { await user.send(`You have been kicked from **${interaction.guild.name}**.\nReason: ${reason}`); } catch {}
    await member.kick(reason);

    const db = getDb();
    const result = db.prepare(
      'INSERT INTO infractions (guild_id, user_id, moderator_id, type, reason) VALUES (?, ?, ?, ?, ?)'
    ).run(interaction.guildId, user.id, interaction.user.id, 'kick', reason);

    await interaction.reply({ embeds: [successEmbed('User Kicked', `**${user.tag || user.username}** has been kicked.\nCase #${result.lastInsertRowid}`)] });

    const config = getGuildConfig(interaction.guildId);
    if (config.mod_log_channel) {
      const channel = interaction.guild.channels.cache.get(config.mod_log_channel);
      if (channel) channel.send({ embeds: [modLogEmbed('Kick', user, interaction.user, reason, null, result.lastInsertRowid)] }).catch(() => {});
    }
  },
};
