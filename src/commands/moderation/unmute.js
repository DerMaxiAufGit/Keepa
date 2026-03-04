const { SlashCommandBuilder } = require('discord.js');
const { successEmbed, errorEmbed, modLogEmbed } = require('../../utils/embeds');
const { getDb, getGuildConfig } = require('../../utils/db');

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
    const member = interaction.guild.members.cache.get(user.id);

    if (!member) return interaction.reply({ embeds: [errorEmbed('Not Found', 'User not in server.')], ephemeral: true });

    await member.timeout(null, reason);

    const db = getDb();
    db.prepare(
      'UPDATE infractions SET active = 0 WHERE guild_id = ? AND user_id = ? AND type = ? AND active = 1'
    ).run(interaction.guildId, user.id, 'mute');

    await interaction.reply({ embeds: [successEmbed('User Unmuted', `**${user.tag || user.username}** has been unmuted.`)] });

    const config = getGuildConfig(interaction.guildId);
    if (config.mod_log_channel) {
      const channel = interaction.guild.channels.cache.get(config.mod_log_channel);
      if (channel) channel.send({ embeds: [modLogEmbed('Unmute', user, interaction.user, reason, null, '-')] }).catch(() => {});
    }
  },
};
