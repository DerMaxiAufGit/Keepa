const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { Colors } = require('../../utils/embeds');
const { getDb } = require('../../utils/db');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('invites')
    .setDescription('Check invite stats for a user')
    .addUserOption(o => o.setName('user').setDescription('User to check').setRequired(true)),
  permissions: [],
  botPermissions: [],

  async execute(interaction) {
    const user = interaction.options.getUser('user');
    const db = getDb();
    const rows = db.prepare(
      'SELECT invite_code, COUNT(*) as count FROM invite_tracking WHERE guild_id = ? AND inviter_id = ? GROUP BY invite_code'
    ).all(interaction.guildId, user.id);

    const total = rows.reduce((sum, r) => sum + r.count, 0);
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
