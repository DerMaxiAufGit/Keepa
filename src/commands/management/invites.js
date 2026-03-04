const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors } = require('../../utils/embeds');
const { query } = require('../../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Check invite stats for a user')
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(true)),
  permissions: ['ManageGuild'],
  botPermissions: [],

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const { rows } = await query(
      'SELECT invite_code, COUNT(*) as count FROM invite_tracking WHERE guild_id = $1 AND inviter_id = $2 GROUP BY invite_code',
      [interaction.guildId, user.id]
    );

    const total = rows.reduce((sum, r) => sum + parseInt(r.count, 10), 0);
    const breakdown = rows.length > 0
      ? rows.map(r => `\`${r.invite_code}\`: **${r.count}** invites`).join('\n')
      : 'No invites tracked.';

    const embed = new EmbedBuilder()
      .setColor(Colors.INFO)
      .setTitle(`Invites for ${user.tag || user.username}`)
      .setDescription(`**Total:** ${total}\n\n${breakdown}`)
      .setFooter({ text: 'Keepa' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  },
};
