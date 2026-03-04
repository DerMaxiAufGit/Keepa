const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed } = require('../../utils/embeds');
const { getDb, getGuildConfig } = require('../../utils/db');

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

    const db = getDb();
    const result = db.prepare(
      'INSERT INTO infractions (guild_id, user_id, moderator_id, type, reason) VALUES (?, ?, ?, ?, ?)'
    ).run(interaction.guildId, user.id, interaction.user.id, 'warn', reason);

    try { await user.send(`You have been warned in **${interaction.guild.name}**.\nReason: ${reason}`); } catch {}

    await interaction.reply({ embeds: [successEmbed('User Warned', `**${user.tag || user.username}** has been warned.\nCase #${result.lastInsertRowid}`)] });

    const config = getGuildConfig(interaction.guildId);
    if (config.mod_log_channel) {
      const channel = interaction.guild.channels.cache.get(config.mod_log_channel);
      if (channel) channel.send({ embeds: [modLogEmbed('Warn', user, interaction.user, reason, null, result.lastInsertRowid)] }).catch(() => {});
    }
  },
};
